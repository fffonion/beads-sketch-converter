use crate::detector_common::{
    boost_confidence, choose_best_detection, detection_outer_margin_ratio, grid_size_in_range,
    make_detection, matches_grid_aspect, rounded_grid_size,
};
use crate::detector_signal::*;
use crate::fft::estimate_period_from_fft;
use crate::types::{Detection, LinePair, RectBox};

pub(crate) fn detect_auto_inner(
    rgba: &[u8],
    width: usize,
    height: usize,
) -> (Option<Detection>, Option<Detection>) {
    let luma = build_luma(rgba, width, height);
    let chart = detect_chart_with_luma(rgba, &luma, width, height);
    let pixel = detect_pixel_art_with_luma(rgba, &luma, width, height);
    (chart, pixel)
}

pub(crate) fn detect_chart_inner(rgba: &[u8], width: usize, height: usize) -> Option<Detection> {
    let luma = build_luma(rgba, width, height);
    detect_chart_with_luma(rgba, &luma, width, height)
}

pub(crate) fn detect_pixel_art_inner(
    rgba: &[u8],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let luma = build_luma(rgba, width, height);
    detect_pixel_art_with_luma(rgba, &luma, width, height)
}

fn detect_chart_with_luma(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let mut candidates = Vec::<Detection>::new();
    if let Some(detection) = detect_framed_chart_inner(rgba, luma, width, height) {
        candidates.push(detection);
    }
    if let Some(detection) = detect_separator_board_inner(rgba, luma, width, height) {
        candidates.push(detection);
    }
    if let Some(detection) = detect_content_coverage_board_inner(rgba, luma, width, height)
        && (has_meaningful_content_outside_detection(rgba, width, height, detection)
            || has_significant_outer_margin(width, height, detection))
    {
        candidates.push(detection);
    }
    if let Some(detection) = detect_dense_edge_board_inner(luma, width, height)
        && (has_meaningful_content_outside_detection(rgba, width, height, detection)
            || has_significant_outer_margin(width, height, detection))
    {
        candidates.push(detection);
    }
    if let Some(detection) = detect_pixel_art_with_luma(rgba, luma, width, height) {
        let trimmed = trim_chart_outer_bands(
            rgba,
            width,
            height,
            Detection {
                confidence: detection.confidence * 0.82,
                ..detection
            },
        );
        let crop_shrank = trimmed.left > detection.left
            || trimmed.top > detection.top
            || trimmed.right < detection.right
            || trimmed.bottom < detection.bottom;
        let grid_shrank = trimmed.grid_width + 1 < detection.grid_width
            || trimmed.grid_height + 1 < detection.grid_height;
        if (crop_shrank || grid_shrank)
            && (has_meaningful_content_outside_detection(rgba, width, height, trimmed)
                || has_significant_outer_margin(width, height, trimmed))
        {
            candidates.push(trimmed);
        }
    }

    choose_best_detection(
        candidates.into_iter().map(|detection| {
            let detection = refine_inner_framed_chart(rgba, luma, width, height, detection)
                .unwrap_or(detection);
            let detection = refine_guide_detection(rgba, width, height, detection);
            trim_chart_outer_bands(rgba, width, height, detection)
        }),
        |detection| score_chart_detection(width, height, detection),
    )
}

fn detect_pixel_art_with_luma(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let mut candidates = Vec::<Detection>::new();
    if let Some(detection) = detect_separator_board_inner(rgba, luma, width, height) {
        candidates.push(detection);
    }
    if let Some(detection) = detect_dense_edge_board_inner(luma, width, height) {
        candidates.push(detection);
    }
    if let Some(detection) = detect_content_box_pixel_inner(rgba, luma, width, height) {
        candidates.push(detection);
    }

    let mut validated = candidates
        .iter()
        .copied()
        .filter(|detection| validate_pixel_detection(rgba, luma, width, height, *detection))
        .collect::<Vec<_>>();
    if !validated.is_empty() {
        return choose_best_detection(validated.drain(..), |detection| {
            score_pixel_detection(width, height, detection)
        })
        .map(|detection| {
            expand_pixel_empty_grid_bands(rgba, width, height, boost_confidence(detection, 0.1))
        });
    }

    choose_best_detection(
        candidates
            .into_iter()
            .filter(|detection| is_reasonable_detection_shape(width, height, *detection)),
        |detection| score_pixel_detection(width, height, detection),
    )
    .map(|detection| expand_pixel_empty_grid_bands(rgba, width, height, detection))
}

fn detect_framed_chart_inner(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let mut column_projection = build_column_edge_projection(luma, width, height);
    let mut row_projection = build_row_edge_projection(luma, width, height);
    smooth_projection(&mut column_projection, 4);
    smooth_projection(&mut row_projection, 4);

    let column_peaks = find_local_peaks(&column_projection, 18, 6);
    let row_peaks = find_local_peaks(&row_projection, 18, 6);
    let horizontal = choose_outer_pair(&column_projection, &column_peaks, width)?;
    let vertical = choose_outer_pair(&row_projection, &row_peaks, height)?;

    if !border_colors_are_consistent(rgba, width, height, horizontal, vertical) {
        return None;
    }

    let crop_width = horizontal.end.saturating_sub(horizontal.start);
    let crop_height = vertical.end.saturating_sub(vertical.start);
    if crop_width < width / 3 || crop_height < height / 3 {
        return None;
    }

    let x_period = dominant_period_for_crop(
        luma,
        width,
        horizontal.start,
        horizontal.end,
        vertical.start,
        vertical.end,
        true,
    )?;
    let y_period = dominant_period_for_crop(
        luma,
        width,
        horizontal.start,
        horizontal.end,
        vertical.start,
        vertical.end,
        false,
    )?;

    let border_inset_x = (x_period / 6).max(1).min(crop_width / 12);
    let border_inset_y = (y_period / 6).max(1).min(crop_height / 12);
    let left = horizontal.start.saturating_add(border_inset_x);
    let top = vertical.start.saturating_add(border_inset_y);
    let right = horizontal.end.saturating_sub(border_inset_x);
    let bottom = vertical.end.saturating_sub(border_inset_y);
    if right <= left + 8 || bottom <= top + 8 {
        return None;
    }

    let inner_width = right - left;
    let inner_height = bottom - top;
    let (grid_width, grid_height) =
        rounded_grid_size(inner_width, inner_height, x_period, y_period);
    if !grid_size_in_range(grid_width, grid_height, 10, 102) {
        return None;
    }

    if !matches_grid_aspect(inner_width, inner_height, grid_width, grid_height, 1.28) {
        return None;
    }

    Some(make_detection(
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        0.96,
    ))
}

fn refine_inner_framed_chart(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
    detection: Detection,
) -> Option<Detection> {
    let rough_cell_width = ((detection.right.saturating_sub(detection.left)) as f32
        / detection.grid_width.max(1) as f32)
        .max(1.0);
    let rough_cell_height = ((detection.bottom.saturating_sub(detection.top)) as f32
        / detection.grid_height.max(1) as f32)
        .max(1.0);
    let pad_x = (rough_cell_width * 2.2).round() as usize;
    let pad_y = (rough_cell_height * 2.2).round() as usize;
    let search = RectBox {
        left: detection.left.saturating_sub(pad_x),
        top: detection.top.saturating_sub(pad_y),
        right: (detection.right + pad_x).min(width),
        bottom: (detection.bottom + pad_y).min(height),
    };
    let refined =
        detect_framed_chart_in_region(rgba, luma, width, height, search, Some(detection))?;
    let refined_area = refined
        .right
        .saturating_sub(refined.left)
        .saturating_mul(refined.bottom.saturating_sub(refined.top));
    let current_area = detection
        .right
        .saturating_sub(detection.left)
        .saturating_mul(detection.bottom.saturating_sub(detection.top))
        .max(1);
    let area_ratio = refined_area as f32 / current_area as f32;
    if !(0.45..=1.04).contains(&area_ratio) {
        return None;
    }

    let rough_grid_ratio = detection.grid_width as f32 / detection.grid_height.max(1) as f32;
    let refined_grid_ratio = refined.grid_width as f32 / refined.grid_height.max(1) as f32;
    let grid_ratio_delta = if rough_grid_ratio > refined_grid_ratio {
        rough_grid_ratio / refined_grid_ratio.max(0.0001)
    } else {
        refined_grid_ratio / rough_grid_ratio.max(0.0001)
    };
    if grid_ratio_delta > 1.18 {
        return None;
    }

    Some(refined)
}

fn detect_framed_chart_in_region(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
    region: RectBox,
    rough_detection: Option<Detection>,
) -> Option<Detection> {
    let region_width = region.right.saturating_sub(region.left);
    let region_height = region.bottom.saturating_sub(region.top);
    if region_width < width / 4 || region_height < height / 4 {
        return None;
    }

    let mut column_projection = build_crop_column_projection(
        luma,
        width,
        region.left,
        region.right,
        region.top,
        region.bottom,
    );
    let mut row_projection = build_crop_row_projection(
        luma,
        width,
        region.left,
        region.right,
        region.top,
        region.bottom,
    );
    smooth_projection(&mut column_projection, 4);
    smooth_projection(&mut row_projection, 4);

    let min_distance_x = rough_detection
        .map(|detection| {
            (((detection.right.saturating_sub(detection.left)) as f32
                / detection.grid_width.max(1) as f32)
                * 0.45)
                .round() as usize
        })
        .unwrap_or(6)
        .max(4);
    let min_distance_y = rough_detection
        .map(|detection| {
            (((detection.bottom.saturating_sub(detection.top)) as f32
                / detection.grid_height.max(1) as f32)
                * 0.45)
                .round() as usize
        })
        .unwrap_or(6)
        .max(4);

    let column_peaks = find_local_peaks(&column_projection, 32, min_distance_x);
    let row_peaks = find_local_peaks(&row_projection, 32, min_distance_y);
    let horizontal = choose_outer_pair(&column_projection, &column_peaks, region_width)?;
    let vertical = choose_outer_pair(&row_projection, &row_peaks, region_height)?;

    let absolute_horizontal = LinePair {
        start: region.left + horizontal.start,
        end: region.left + horizontal.end,
    };
    let absolute_vertical = LinePair {
        start: region.top + vertical.start,
        end: region.top + vertical.end,
    };

    if !border_colors_are_consistent(rgba, width, height, absolute_horizontal, absolute_vertical) {
        return None;
    }

    let crop_width = absolute_horizontal
        .end
        .saturating_sub(absolute_horizontal.start);
    let crop_height = absolute_vertical
        .end
        .saturating_sub(absolute_vertical.start);
    if crop_width < width / 4 || crop_height < height / 4 {
        return None;
    }

    let x_period = dominant_period_for_crop(
        luma,
        width,
        absolute_horizontal.start,
        absolute_horizontal.end,
        absolute_vertical.start,
        absolute_vertical.end,
        true,
    )?;
    let y_period = dominant_period_for_crop(
        luma,
        width,
        absolute_horizontal.start,
        absolute_horizontal.end,
        absolute_vertical.start,
        absolute_vertical.end,
        false,
    )?;

    let border_inset_x = (x_period / 10).max(1).min(crop_width / 16);
    let border_inset_y = (y_period / 10).max(1).min(crop_height / 16);
    let left = absolute_horizontal.start.saturating_add(border_inset_x);
    let top = absolute_vertical.start.saturating_add(border_inset_y);
    let right = absolute_horizontal.end.saturating_sub(border_inset_x);
    let bottom = absolute_vertical.end.saturating_sub(border_inset_y);
    if right <= left + 8 || bottom <= top + 8 {
        return None;
    }

    let inner_width = right - left;
    let inner_height = bottom - top;
    let (grid_width, grid_height) =
        rounded_grid_size(inner_width, inner_height, x_period, y_period);
    if !grid_size_in_range(grid_width, grid_height, 10, 102) {
        return None;
    }

    if let Some(rough) = rough_detection {
        let rough_cell_width =
            (rough.right.saturating_sub(rough.left)) as f32 / rough.grid_width.max(1) as f32;
        let rough_cell_height =
            (rough.bottom.saturating_sub(rough.top)) as f32 / rough.grid_height.max(1) as f32;
        let cell_ratio_x = if x_period as f32 > rough_cell_width {
            x_period as f32 / rough_cell_width.max(0.0001)
        } else {
            rough_cell_width / x_period.max(1) as f32
        };
        let cell_ratio_y = if y_period as f32 > rough_cell_height {
            y_period as f32 / rough_cell_height.max(0.0001)
        } else {
            rough_cell_height / y_period.max(1) as f32
        };
        if cell_ratio_x > 1.32 || cell_ratio_y > 1.32 {
            return None;
        }
    }

    if !matches_grid_aspect(inner_width, inner_height, grid_width, grid_height, 1.28) {
        return None;
    }

    Some(make_detection(
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        0.94,
    ))
}

fn detect_separator_board_inner(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let mut x_signal = build_light_separator_coverage_signal(rgba, width, height, true);
    let mut y_signal = build_light_separator_coverage_signal(rgba, width, height, false);
    smooth_projection(&mut x_signal, 2);
    smooth_projection(&mut y_signal, 2);

    let x_range = detect_separator_family_extent(&x_signal)?;
    let y_range = detect_separator_family_extent(&y_signal)?;

    let left = x_range.start;
    let top = y_range.start;
    let right = x_range.end;
    let bottom = y_range.end;
    let crop_width = right.saturating_sub(left);
    let crop_height = bottom.saturating_sub(top);
    if crop_width < width / 2 || crop_height < height / 2 {
        return None;
    }

    let area_ratio = (crop_width * crop_height) as f32 / (width * height).max(1) as f32;
    if !(0.24..=0.99).contains(&area_ratio) {
        return None;
    }

    let x_signal = build_light_separator_crop_signal(rgba, width, left, right, top, bottom, true);
    let y_signal = build_light_separator_crop_signal(rgba, width, left, right, top, bottom, false);
    let x_period = estimate_period_from_fft(&x_signal)
        .or_else(|| dominant_period_for_crop(luma, width, left, right, top, bottom, true))?;
    let y_period = estimate_period_from_fft(&y_signal)
        .or_else(|| dominant_period_for_crop(luma, width, left, right, top, bottom, false))?;
    let (mut grid_width, mut grid_height) =
        rounded_grid_size(crop_width, crop_height, x_period, y_period);
    if should_add_boundary_cell(crop_width, x_period)
        && has_boundary_separator_lines(&x_signal, x_period)
    {
        grid_width += 1;
    }
    if should_add_boundary_cell(crop_height, y_period)
        && has_boundary_separator_lines(&y_signal, y_period)
    {
        grid_height += 1;
    }

    if !grid_size_in_range(grid_width, grid_height, 10, 102) {
        return None;
    }

    if !matches_grid_aspect(crop_width, crop_height, grid_width, grid_height, 1.24) {
        return None;
    }

    Some(make_detection(
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        0.8,
    ))
}

fn detect_dense_edge_board_inner(luma: &[f32], width: usize, height: usize) -> Option<Detection> {
    let mut x_signal = build_column_edge_projection(luma, width, height);
    let mut y_signal = build_row_edge_projection(luma, width, height);
    normalize_projection(&mut x_signal, height.max(1) as f32);
    normalize_projection(&mut y_signal, width.max(1) as f32);
    smooth_projection(&mut x_signal, 6);
    smooth_projection(&mut y_signal, 6);

    let x_range = detect_dense_signal_extent(&x_signal, 0.12, 0.34, 0.95, 20, 0.34)?;
    let y_range = detect_dense_signal_extent(&y_signal, 0.12, 0.34, 0.95, 20, 0.34)?;
    let left = x_range.start;
    let top = y_range.start;
    let right = x_range.end;
    let bottom = y_range.end;

    let crop_width = right.saturating_sub(left);
    let crop_height = bottom.saturating_sub(top);
    if crop_width < width / 2 || crop_height < height / 2 {
        return None;
    }

    let area_ratio = (crop_width * crop_height) as f32 / (width * height).max(1) as f32;
    if !(0.24..=0.985).contains(&area_ratio) {
        return None;
    }

    let x_period = estimate_edge_period_for_crop(luma, width, left, right, top, bottom, true)
        .or_else(|| dominant_period_for_crop(luma, width, left, right, top, bottom, true))?;
    let y_period = estimate_edge_period_for_crop(luma, width, left, right, top, bottom, false)
        .or_else(|| dominant_period_for_crop(luma, width, left, right, top, bottom, false))?;
    let (grid_width, grid_height) = rounded_grid_size(crop_width, crop_height, x_period, y_period);
    if !grid_size_in_range(grid_width, grid_height, 10, 102) {
        return None;
    }

    if !matches_grid_aspect(crop_width, crop_height, grid_width, grid_height, 1.28) {
        return None;
    }

    Some(make_detection(
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        0.68,
    ))
}

fn detect_content_coverage_board_inner(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let mut x_signal = build_content_coverage_signal(rgba, width, height, true);
    let mut y_signal = build_content_coverage_signal(rgba, width, height, false);
    smooth_projection(&mut x_signal, 4);
    smooth_projection(&mut y_signal, 4);

    let x_range = detect_dense_signal_extent(&x_signal, 0.02, 0.42, 0.85, 20, 0.36)?;
    let y_range = detect_dense_signal_extent(&y_signal, 0.02, 0.42, 0.85, 20, 0.36)?;
    let left = x_range.start;
    let top = y_range.start;
    let right = x_range.end;
    let bottom = y_range.end;

    let crop_width = right.saturating_sub(left);
    let crop_height = bottom.saturating_sub(top);
    if crop_width < width / 2 || crop_height < height / 2 {
        return None;
    }

    let area_ratio = (crop_width * crop_height) as f32 / (width * height).max(1) as f32;
    if !(0.24..=0.985).contains(&area_ratio) {
        return None;
    }

    let x_period = estimate_edge_period_for_crop(luma, width, left, right, top, bottom, true)
        .or_else(|| dominant_period_for_crop(luma, width, left, right, top, bottom, true))?;
    let y_period = estimate_edge_period_for_crop(luma, width, left, right, top, bottom, false)
        .or_else(|| dominant_period_for_crop(luma, width, left, right, top, bottom, false))?;
    let (grid_width, grid_height) = rounded_grid_size(crop_width, crop_height, x_period, y_period);
    if !grid_size_in_range(grid_width, grid_height, 10, 102) {
        return None;
    }

    if !matches_grid_aspect(crop_width, crop_height, grid_width, grid_height, 1.24) {
        return None;
    }

    Some(make_detection(
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        0.64,
    ))
}

fn detect_content_box_pixel_inner(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
) -> Option<Detection> {
    let content_box = detect_content_box(rgba, width, height)?;
    let crop_width = content_box.right.saturating_sub(content_box.left);
    let crop_height = content_box.bottom.saturating_sub(content_box.top);
    if crop_width < width / 3 || crop_height < height / 3 {
        return None;
    }

    let x_period = estimate_edge_period_for_crop(
        luma,
        width,
        content_box.left,
        content_box.right,
        content_box.top,
        content_box.bottom,
        true,
    )
    .or_else(|| {
        dominant_period_for_crop(
            luma,
            width,
            content_box.left,
            content_box.right,
            content_box.top,
            content_box.bottom,
            true,
        )
    })?;
    let y_period = estimate_edge_period_for_crop(
        luma,
        width,
        content_box.left,
        content_box.right,
        content_box.top,
        content_box.bottom,
        false,
    )
    .or_else(|| {
        dominant_period_for_crop(
            luma,
            width,
            content_box.left,
            content_box.right,
            content_box.top,
            content_box.bottom,
            false,
        )
    })?;

    let (grid_width, grid_height) = rounded_grid_size(crop_width, crop_height, x_period, y_period);
    if !grid_size_in_range(grid_width, grid_height, 4, 102) {
        return None;
    }

    Some(make_detection(
        content_box.left,
        content_box.top,
        content_box.right,
        content_box.bottom,
        grid_width,
        grid_height,
        0.7,
    ))
}

fn refine_guide_detection(
    rgba: &[u8],
    width: usize,
    height: usize,
    detection: Detection,
) -> Detection {
    let x_guide = detect_strong_guide_family(rgba, width, height, detection, true);
    let y_guide = detect_strong_guide_family(rgba, width, height, detection, false);

    let mut left = detection.left;
    let mut top = detection.top;
    let mut right = detection.right;
    let mut bottom = detection.bottom;
    let mut grid_width = detection.grid_width;
    let mut grid_height = detection.grid_height;

    if let Some((period, first_peak, last_peak)) = x_guide {
        let guide_cell = (period as f32 / 5.0).max(1.0);
        left = first_peak;
        let right_remainder = width.saturating_sub(last_peak);
        if (right_remainder as f32) >= period as f32 * 0.75
            && (right_remainder as f32) <= period as f32 * 1.25
        {
            right = (last_peak + period).min(width);
        } else {
            right = right.max(last_peak);
        }
        grid_width = (((right - left) as f32) / guide_cell).round() as usize;
    }

    if let Some((period, first_peak, last_peak)) = y_guide {
        let guide_cell = (period as f32 / 5.0).max(1.0);
        top = first_peak;
        let bottom_remainder = height.saturating_sub(last_peak);
        if (bottom_remainder as f32) >= period as f32 * 0.75
            && (bottom_remainder as f32) <= period as f32 * 1.25
        {
            bottom = (last_peak + period).min(height);
        } else {
            bottom = bottom.max(last_peak);
        }
        grid_height = (((bottom - top) as f32) / guide_cell).round() as usize;
        if top.abs_diff(first_peak) as f32 <= guide_cell * 0.6
            && bottom.abs_diff(last_peak) as f32 <= guide_cell * 0.6
        {
            grid_height += 1;
        }
    }

    Detection {
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        confidence: (detection.confidence + 0.04).min(0.99),
    }
}

fn detect_content_box(rgba: &[u8], width: usize, height: usize) -> Option<RectBox> {
    let mut left = width;
    let mut top = height;
    let mut right = 0_usize;
    let mut bottom = 0_usize;
    let mut hits = 0_usize;

    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) * 4;
            let pixel = [
                rgba[index],
                rgba[index + 1],
                rgba[index + 2],
                rgba[index + 3],
            ];
            if !is_content_pixel(pixel) {
                continue;
            }
            hits += 1;
            left = left.min(x);
            top = top.min(y);
            right = right.max(x + 1);
            bottom = bottom.max(y + 1);
        }
    }

    if hits < (width * height).max(1) / 80 || right <= left || bottom <= top {
        return None;
    }

    let padding_x = (width / 128).max(2);
    let padding_y = (height / 128).max(2);
    Some(RectBox {
        left: left.saturating_sub(padding_x),
        top: top.saturating_sub(padding_y),
        right: (right + padding_x).min(width),
        bottom: (bottom + padding_y).min(height),
    })
}

fn validate_pixel_detection(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
    detection: Detection,
) -> bool {
    let crop_width = detection.crop_width();
    let crop_height = detection.crop_height();
    if crop_width < width / 3 || crop_height < height / 3 {
        return false;
    }
    if !(4..=102).contains(&detection.grid_width) || !(4..=102).contains(&detection.grid_height) {
        return false;
    }

    let cell_width = detection.cell_width();
    let cell_height = detection.cell_height();
    if cell_width < 3.0 || cell_height < 3.0 {
        return false;
    }
    let cell_aspect = (cell_width / cell_height.max(1e-6)).max(cell_height / cell_width.max(1e-6));
    if cell_aspect > 1.35 {
        return false;
    }

    if !matches_grid_aspect(
        crop_width,
        crop_height,
        detection.grid_width,
        detection.grid_height,
        1.22,
    ) {
        return false;
    }

    let unique_colors = count_unique_colors_rough(rgba, width, detection);
    if unique_colors > 192 {
        return false;
    }

    let coherent_cells = estimate_coherent_cell_count(rgba, width, detection);
    if coherent_cells < 8 {
        return false;
    }

    let boundary_ratio = estimate_grid_boundary_strength(luma, width, detection);
    boundary_ratio >= 1.08
}

fn has_meaningful_content_outside_detection(
    rgba: &[u8],
    width: usize,
    height: usize,
    detection: Detection,
) -> bool {
    let regions = [
        RectBox {
            left: 0,
            top: 0,
            right: width,
            bottom: detection.top,
        },
        RectBox {
            left: 0,
            top: detection.bottom,
            right: width,
            bottom: height,
        },
        RectBox {
            left: 0,
            top: detection.top,
            right: detection.left,
            bottom: detection.bottom,
        },
        RectBox {
            left: detection.right,
            top: detection.top,
            right: width,
            bottom: detection.bottom,
        },
    ];

    for region in regions {
        let region_width = region.right.saturating_sub(region.left);
        let region_height = region.bottom.saturating_sub(region.top);
        if region_width == 0 || region_height == 0 {
            continue;
        }

        let area = region_width * region_height;
        let absolute_area_ratio = area as f32 / (width * height).max(1) as f32;
        if absolute_area_ratio < 0.018 {
            continue;
        }

        let step_x = (region_width / 120).max(1);
        let step_y = (region_height / 120).max(1);
        let mut sample_count = 0_usize;
        let mut hits = 0_usize;
        for y in (region.top..region.bottom).step_by(step_y) {
            for x in (region.left..region.right).step_by(step_x) {
                let index = (y * width + x) * 4;
                let pixel = [
                    rgba[index],
                    rgba[index + 1],
                    rgba[index + 2],
                    rgba[index + 3],
                ];
                sample_count += 1;
                if is_content_pixel(pixel) {
                    hits += 1;
                }
            }
        }

        let sampled_ratio = hits as f32 / sample_count.max(1) as f32;
        if sampled_ratio >= 0.005 {
            return true;
        }
    }

    false
}

fn has_significant_outer_margin(width: usize, height: usize, detection: Detection) -> bool {
    let left_margin = detection.left as f32 / width.max(1) as f32;
    let top_margin = detection.top as f32 / height.max(1) as f32;
    let right_margin = width.saturating_sub(detection.right) as f32 / width.max(1) as f32;
    let bottom_margin = height.saturating_sub(detection.bottom) as f32 / height.max(1) as f32;
    let outside_area = (detection.left * height)
        + (width.saturating_sub(detection.right) * height)
        + ((detection.right.saturating_sub(detection.left))
            * (detection.top + height.saturating_sub(detection.bottom)));
    let outside_ratio = outside_area as f32 / (width * height).max(1) as f32;

    left_margin >= 0.07
        || top_margin >= 0.07
        || right_margin >= 0.07
        || bottom_margin >= 0.07
        || outside_ratio >= 0.08
}

fn score_pixel_detection(width: usize, height: usize, detection: Detection) -> f32 {
    let crop_width = detection.crop_width();
    let crop_height = detection.crop_height();
    let area_ratio = (crop_width * crop_height) as f32 / (width * height).max(1) as f32;
    let cell_width = detection.cell_width();
    let cell_height = detection.cell_height();
    detection.confidence * 10.0 + area_ratio * 3.0 + cell_width.min(cell_height) * 0.05
}

fn is_reasonable_detection_shape(width: usize, height: usize, detection: Detection) -> bool {
    let crop_width = detection.crop_width();
    let crop_height = detection.crop_height();
    if crop_width < width / 3 || crop_height < height / 3 {
        return false;
    }

    let area_ratio = (crop_width * crop_height) as f32 / (width * height).max(1) as f32;
    if area_ratio < 0.2 {
        return false;
    }

    matches_grid_aspect(
        crop_width,
        crop_height,
        detection.grid_width,
        detection.grid_height,
        1.3,
    )
}

#[derive(Clone, Copy)]
struct BandMetrics {
    colored_ratio: f32,
    separator_ratio: f32,
}

fn score_chart_detection(width: usize, height: usize, detection: Detection) -> f32 {
    let crop_width = detection.crop_width();
    let crop_height = detection.crop_height();
    let area_ratio = (crop_width * crop_height) as f32 / (width * height).max(1) as f32;
    let margin_ratio = detection_outer_margin_ratio(width, height, detection);
    let cell_width = detection.cell_width();
    let cell_height = detection.cell_height();
    detection.confidence * 10.0
        + area_ratio * 1.2
        + margin_ratio * 2.4
        + cell_width.min(cell_height) * 0.03
}

fn trim_chart_outer_bands(
    rgba: &[u8],
    width: usize,
    height: usize,
    detection: Detection,
) -> Detection {
    if detection.confidence >= 0.95 {
        return detection;
    }

    let cell_width = detection.cell_width().round() as usize;
    let cell_height = detection.cell_height().round() as usize;
    let near_left = detection.left <= (cell_width / 2).max(2);
    let near_right = width.saturating_sub(detection.right) <= (cell_width / 2).max(2);
    let near_top = detection.top <= (cell_height / 2).max(2);
    let near_bottom = height.saturating_sub(detection.bottom) <= (cell_height / 2).max(2);
    if !(near_left || near_right || near_top || near_bottom) {
        let full_page_width_ratio =
            detection.right.saturating_sub(detection.left) as f32 / width.max(1) as f32;
        if full_page_width_ratio < 0.94 {
            return detection;
        }

        if let Some(trim_count) = count_full_page_trailing_annotation_bands(rgba, width, detection)
        {
            let band_span = detection.cell_height().round() as usize;
            if let Some(trimmed) = build_trimmed_chart_detection_simple(
                detection,
                false,
                band_span.max(1),
                0,
                trim_count,
            ) {
                return boost_confidence(trimmed, 0.01);
            }
        }

        return detection;
    }

    let luma = build_luma(rgba, width, height);
    let current = optimize_chart_band_trim(rgba, &luma, width, height, detection, false);
    if near_left || near_right {
        optimize_chart_band_trim(rgba, &luma, width, height, current, true)
    } else {
        current
    }
}

#[derive(Clone, Copy)]
struct ChartBandProfile {
    colored_ratio: f32,
    separator_ratio: f32,
    grid_strength: f32,
}

fn optimize_chart_band_trim(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    height: usize,
    detection: Detection,
    vertical_band: bool,
) -> Detection {
    let band_count = if vertical_band {
        detection.grid_width
    } else {
        detection.grid_height
    };
    if band_count < 12 {
        return detection;
    }

    let band_span = if vertical_band {
        detection.cell_width().round() as usize
    } else {
        detection.cell_height().round() as usize
    }
    .max(1);
    let profiles =
        collect_chart_band_profiles(rgba, luma, width, detection, vertical_band, band_span);
    if profiles.len() != band_count {
        return detection;
    }

    let Some(baseline) = chart_band_baseline(&profiles) else {
        return detection;
    };
    let max_trim = (band_count / 5).clamp(1, 6);
    let symmetric_edges = vertical_band
        && detection.left <= (band_span / 2).max(2)
        && width.saturating_sub(detection.right) <= (band_span / 2).max(2);
    let near_start_edge = if vertical_band {
        detection.left <= (band_span / 2).max(2)
    } else {
        detection.top <= (band_span / 2).max(2)
    };
    let near_end_edge = if vertical_band {
        width.saturating_sub(detection.right) <= (band_span / 2).max(2)
    } else {
        height.saturating_sub(detection.bottom) <= (band_span / 2).max(2)
    };
    let base_score = chart_band_trim_score(&profiles, baseline, 0, 0);
    let mut best_score = base_score;
    let mut best_start_trim = 0_usize;
    let mut best_end_trim = 0_usize;

    for start_trim in 0..=max_trim {
        for end_trim in 0..=max_trim {
            if start_trim == 0 && end_trim == 0 {
                continue;
            }
            if start_trim + end_trim >= band_count.saturating_sub(10) {
                continue;
            }
            if symmetric_edges && (start_trim != end_trim || start_trim > 1 || end_trim > 1) {
                continue;
            }
            let score = chart_band_trim_score(&profiles, baseline, start_trim, end_trim);
            if score > best_score + 0.16 {
                best_score = score;
                best_start_trim = start_trim;
                best_end_trim = end_trim;
            }
        }
    }

    if symmetric_edges && best_start_trim == 0 && best_end_trim == 0 && profiles.len() >= 4 {
        let edge_similarity = chart_band_similarity(profiles[0], baseline)
            + chart_band_similarity(*profiles.last().unwrap_or(&profiles[0]), baseline);
        if edge_similarity < 1.52 {
            best_start_trim = 1;
            best_end_trim = 1;
        }
    }

    if !vertical_band && near_end_edge && best_end_trim == 0 {
        best_end_trim = count_trailing_decorative_bands(&profiles, baseline)
            .max(count_trailing_drop_bands(&profiles))
            .min(max_trim);
    }
    if !vertical_band && near_start_edge && best_start_trim == 0 {
        best_start_trim = count_leading_decorative_bands(&profiles, baseline)
            .max(count_leading_drop_bands(&profiles))
            .min(max_trim.min(2));
    }
    if !vertical_band
        && best_start_trim >= 3
        && best_start_trim < profiles.len()
        && best_start_trim < max_trim
        && chart_band_similarity(profiles[best_start_trim], baseline) < 0.9
    {
        best_start_trim += 1;
    }

    if best_start_trim == 0 && best_end_trim == 0 {
        return detection;
    }

    let Some(trimmed) = build_trimmed_chart_detection_simple(
        detection,
        vertical_band,
        band_span,
        best_start_trim,
        best_end_trim,
    ) else {
        return detection;
    };

    boost_confidence(trimmed, 0.01)
}

fn collect_chart_band_profiles(
    rgba: &[u8],
    luma: &[f32],
    width: usize,
    detection: Detection,
    vertical_band: bool,
    band_span: usize,
) -> Vec<ChartBandProfile> {
    let band_count = if vertical_band {
        detection.grid_width
    } else {
        detection.grid_height
    };
    let mut profiles = Vec::with_capacity(band_count);
    for index in 0..band_count {
        let Some(rect) = chart_index_band_rect(detection, band_span, vertical_band, index) else {
            continue;
        };
        let metrics = sample_band_metrics(rgba, width, 0, rect);
        let grid_strength =
            estimate_rect_boundary_strength(luma, width, detection, rect, !vertical_band);
        profiles.push(ChartBandProfile {
            colored_ratio: metrics.colored_ratio,
            separator_ratio: metrics.separator_ratio,
            grid_strength,
        });
    }
    profiles
}

fn chart_index_band_rect(
    detection: Detection,
    band_span: usize,
    vertical_band: bool,
    index: usize,
) -> Option<RectBox> {
    if vertical_band {
        let left = detection.left + band_span * index;
        let right = if index + 1 >= detection.grid_width {
            detection.right
        } else {
            (left + band_span).min(detection.right)
        };
        if right <= left {
            return None;
        }
        return Some(RectBox {
            left,
            top: detection.top,
            right,
            bottom: detection.bottom,
        });
    }

    let top = detection.top + band_span * index;
    let bottom = if index + 1 >= detection.grid_height {
        detection.bottom
    } else {
        (top + band_span).min(detection.bottom)
    };
    if bottom <= top {
        return None;
    }
    Some(RectBox {
        left: detection.left,
        top,
        right: detection.right,
        bottom,
    })
}

fn chart_band_baseline(profiles: &[ChartBandProfile]) -> Option<ChartBandProfile> {
    if profiles.len() < 6 {
        return None;
    }
    let mut ranked = profiles.to_vec();
    ranked.sort_by(|left, right| {
        let left_score = left.grid_strength * 0.7 + left.separator_ratio * 0.3;
        let right_score = right.grid_strength * 0.7 + right.separator_ratio * 0.3;
        right_score.total_cmp(&left_score)
    });
    let take_count = (ranked.len() / 3).max(4).min(ranked.len());
    let mut colored = 0.0_f32;
    let mut separator = 0.0_f32;
    let mut grid = 0.0_f32;
    let mut count = 0_usize;
    for profile in ranked.iter().take(take_count) {
        colored += profile.colored_ratio;
        separator += profile.separator_ratio;
        grid += profile.grid_strength;
        count += 1;
    }
    if count == 0 {
        return None;
    }
    Some(ChartBandProfile {
        colored_ratio: colored / count as f32,
        separator_ratio: separator / count as f32,
        grid_strength: grid / count as f32,
    })
}

fn chart_band_trim_score(
    profiles: &[ChartBandProfile],
    baseline: ChartBandProfile,
    start_trim: usize,
    end_trim: usize,
) -> f32 {
    let kept_start = start_trim.min(profiles.len().saturating_sub(1));
    let kept_end = profiles
        .len()
        .saturating_sub(1 + end_trim.min(profiles.len().saturating_sub(1)));
    if kept_end <= kept_start {
        return f32::NEG_INFINITY;
    }

    let edge_similarity = chart_band_similarity(profiles[kept_start], baseline)
        + chart_band_similarity(profiles[kept_end], baseline);

    let mut removed_dissimilarity = 0.0_f32;
    let mut removed_count = 0_usize;
    for profile in profiles.iter().take(start_trim) {
        removed_dissimilarity += 1.0 - chart_band_similarity(*profile, baseline);
        removed_count += 1;
    }
    for profile in profiles
        .iter()
        .skip(profiles.len().saturating_sub(end_trim))
    {
        removed_dissimilarity += 1.0 - chart_band_similarity(*profile, baseline);
        removed_count += 1;
    }
    let removed_score = removed_dissimilarity / removed_count.max(1) as f32;
    edge_similarity + removed_score * 1.1 - (start_trim + end_trim) as f32 * 0.05
}

fn build_trimmed_chart_detection_simple(
    detection: Detection,
    vertical_band: bool,
    band_span: usize,
    start_trim: usize,
    end_trim: usize,
) -> Option<Detection> {
    let mut trimmed = detection;
    if vertical_band {
        trimmed.left = (trimmed.left + band_span * start_trim).min(trimmed.right.saturating_sub(1));
        trimmed.right = trimmed
            .right
            .saturating_sub(band_span * end_trim)
            .max(trimmed.left + 1);
        trimmed.grid_width = trimmed.grid_width.saturating_sub(start_trim + end_trim);
    } else {
        trimmed.top = (trimmed.top + band_span * start_trim).min(trimmed.bottom.saturating_sub(1));
        trimmed.bottom = trimmed
            .bottom
            .saturating_sub(band_span * end_trim)
            .max(trimmed.top + 1);
        trimmed.grid_height = trimmed.grid_height.saturating_sub(start_trim + end_trim);
    }

    let crop_width = trimmed.right.saturating_sub(trimmed.left);
    let crop_height = trimmed.bottom.saturating_sub(trimmed.top);
    if crop_width < 8 || crop_height < 8 || trimmed.grid_width < 10 || trimmed.grid_height < 10 {
        return None;
    }

    Some(trimmed)
}

fn count_full_page_trailing_annotation_bands(
    rgba: &[u8],
    width: usize,
    detection: Detection,
) -> Option<usize> {
    if detection.grid_width < 30 || detection.grid_height < 20 {
        return None;
    }

    let band_span = detection.cell_height().round() as usize;
    if band_span < 4 {
        return None;
    }

    let height = (rgba.len() / 4) / width.max(1);
    let luma = build_luma(rgba, width, height.max(1));
    let profiles = collect_chart_band_profiles(rgba, &luma, width, detection, false, band_span);
    if profiles.len() != detection.grid_height {
        return None;
    }
    let baseline = chart_band_baseline(&profiles)?;

    let mut trimmed = 0_usize;
    for profile in profiles.iter().rev() {
        let similarity = chart_band_similarity(*profile, baseline);
        let is_annotation_band = similarity < 0.74
            || profile.separator_ratio > baseline.separator_ratio * 1.42
            || (profile.colored_ratio < baseline.colored_ratio * 0.22
                && profile.separator_ratio > baseline.separator_ratio * 1.12)
            || (profile.separator_ratio < baseline.separator_ratio * 0.22
                && profile.colored_ratio > baseline.colored_ratio * 0.72);
        if !is_annotation_band {
            break;
        }
        trimmed += 1;
        if trimmed >= 4 {
            break;
        }
    }

    (trimmed > 0).then_some(trimmed)
}

fn count_leading_decorative_bands(
    profiles: &[ChartBandProfile],
    baseline: ChartBandProfile,
) -> usize {
    profiles
        .iter()
        .take_while(|profile| is_decorative_chart_band(**profile, baseline))
        .count()
}

fn count_trailing_decorative_bands(
    profiles: &[ChartBandProfile],
    baseline: ChartBandProfile,
) -> usize {
    profiles
        .iter()
        .rev()
        .take_while(|profile| is_decorative_chart_band(**profile, baseline))
        .count()
}

fn count_leading_drop_bands(profiles: &[ChartBandProfile]) -> usize {
    let mut trimmed = 0_usize;
    for index in 0..profiles.len().saturating_sub(1) {
        let current = profiles[index];
        let next = profiles[index + 1];
        if current.separator_ratio < next.separator_ratio * 0.92
            && current.grid_strength < next.grid_strength * 0.98
        {
            trimmed += 1;
            continue;
        }
        break;
    }
    trimmed
}

fn count_trailing_drop_bands(profiles: &[ChartBandProfile]) -> usize {
    let mut trimmed = 0_usize;
    for index in (1..profiles.len()).rev() {
        let current = profiles[index];
        let previous = profiles[index - 1];
        if current.separator_ratio < previous.separator_ratio * 0.92
            && current.grid_strength < previous.grid_strength * 0.98
        {
            trimmed += 1;
            continue;
        }
        break;
    }
    trimmed
}

fn is_decorative_chart_band(profile: ChartBandProfile, baseline: ChartBandProfile) -> bool {
    let similarity = chart_band_similarity(profile, baseline);
    similarity < 0.82
        || (profile.separator_ratio < baseline.separator_ratio * 0.92
            && profile.grid_strength < baseline.grid_strength * 0.98)
        || (profile.colored_ratio > baseline.colored_ratio * 1.05
            && profile.grid_strength < baseline.grid_strength * 1.02)
}

fn chart_band_similarity(profile: ChartBandProfile, baseline: ChartBandProfile) -> f32 {
    let colored = normalized_band_similarity(profile.colored_ratio, baseline.colored_ratio);
    let separator = normalized_band_similarity(profile.separator_ratio, baseline.separator_ratio);
    let grid = normalized_band_similarity(profile.grid_strength, baseline.grid_strength);
    colored * 0.22 + separator * 0.28 + grid * 0.5
}

fn normalized_band_similarity(value: f32, baseline: f32) -> f32 {
    let ratio = (value / baseline.max(0.001)).clamp(0.001, 8.0);
    1.0 - (ratio.ln().abs() / 2.1).min(1.0)
}

fn estimate_rect_boundary_strength(
    luma: &[f32],
    width: usize,
    detection: Detection,
    rect: RectBox,
    vertical_lines: bool,
) -> f32 {
    if rect.right <= rect.left + 2 || rect.bottom <= rect.top + 2 {
        return 0.0;
    }

    let cell_size = if vertical_lines {
        detection.cell_width()
    } else {
        detection.cell_height()
    };
    if cell_size <= 1.0 {
        return 0.0;
    }

    let steps = if vertical_lines {
        detection.grid_width
    } else {
        detection.grid_height
    };
    let mut boundary_total = 0.0_f32;
    let mut boundary_count = 0_usize;
    let mut interior_total = 0.0_f32;
    let mut interior_count = 0_usize;

    for index in 1..steps {
        let boundary = if vertical_lines {
            detection.left as f32 + index as f32 * cell_size
        } else {
            detection.top as f32 + index as f32 * cell_size
        };
        let interior = if vertical_lines {
            detection.left as f32 + (index as f32 - 0.5) * cell_size
        } else {
            detection.top as f32 + (index as f32 - 0.5) * cell_size
        };

        boundary_total += sample_axis_gradient_in_rect(luma, width, rect, boundary, vertical_lines);
        interior_total += sample_axis_gradient_in_rect(luma, width, rect, interior, vertical_lines);
        boundary_count += 1;
        interior_count += 1;
    }

    let boundary_mean = boundary_total / boundary_count.max(1) as f32;
    let interior_mean = interior_total / interior_count.max(1) as f32;
    boundary_mean / interior_mean.max(0.001)
}

fn sample_axis_gradient_in_rect(
    luma: &[f32],
    width: usize,
    rect: RectBox,
    position: f32,
    vertical_lines: bool,
) -> f32 {
    if vertical_lines {
        let x = position.round() as usize;
        if rect.right <= rect.left + 2 {
            return 0.0;
        }
        let clamped_x = x.clamp(rect.left + 1, rect.right.saturating_sub(2));
        let mut total = 0.0_f32;
        let mut count = 0_usize;
        for y in rect.top.saturating_add(1)..rect.bottom.saturating_sub(1) {
            let row = y * width;
            total += (luma[row + clamped_x + 1] - luma[row + clamped_x - 1]).abs();
            count += 1;
        }
        return total / count.max(1) as f32;
    }

    let y = position.round() as usize;
    if rect.bottom <= rect.top + 2 {
        return 0.0;
    }
    let clamped_y = y.clamp(rect.top + 1, rect.bottom.saturating_sub(2));
    let mut total = 0.0_f32;
    let mut count = 0_usize;
    let row = clamped_y * width;
    for x in rect.left.saturating_add(1)..rect.right.saturating_sub(1) {
        total += (luma[row + x + width] - luma[row + x - width]).abs();
        count += 1;
    }
    total / count.max(1) as f32
}

fn expand_pixel_empty_grid_bands(
    rgba: &[u8],
    width: usize,
    height: usize,
    detection: Detection,
) -> Detection {
    let mut current = detection;

    for _ in 0..4 {
        if !should_expand_pixel_band(rgba, width, height, current, true, true) {
            break;
        }
        let grow = current.cell_width().round() as usize;
        current.left = current.left.saturating_sub(grow);
        current.grid_width += 1;
    }

    for _ in 0..4 {
        if !should_expand_pixel_band(rgba, width, height, current, true, false) {
            break;
        }
        let grow = current.cell_width().round() as usize;
        current.right = (current.right + grow).min(width);
        current.grid_width += 1;
    }

    for _ in 0..4 {
        if !should_expand_pixel_band(rgba, width, height, current, false, true) {
            break;
        }
        let grow = current.cell_height().round() as usize;
        current.top = current.top.saturating_sub(grow);
        current.grid_height += 1;
    }

    for _ in 0..4 {
        if !should_expand_pixel_band(rgba, width, height, current, false, false) {
            break;
        }
        let grow = current.cell_height().round() as usize;
        current.bottom = (current.bottom + grow).min(height);
        current.grid_height += 1;
    }

    current
}

fn should_expand_pixel_band(
    rgba: &[u8],
    width: usize,
    height: usize,
    detection: Detection,
    vertical_band: bool,
    toward_start: bool,
) -> bool {
    let metrics =
        sample_outside_band_metrics(rgba, width, height, detection, vertical_band, toward_start);
    metrics.separator_ratio >= 0.035 && metrics.colored_ratio <= 0.06
}

fn sample_outside_band_metrics(
    rgba: &[u8],
    width: usize,
    height: usize,
    detection: Detection,
    vertical_band: bool,
    toward_start: bool,
) -> BandMetrics {
    let band_span = if vertical_band {
        detection.cell_width().round() as usize
    } else {
        detection.cell_height().round() as usize
    }
    .max(1);

    if vertical_band {
        if toward_start {
            let left = detection.left.saturating_sub(band_span);
            return sample_band_metrics(
                rgba,
                width,
                height,
                RectBox {
                    left,
                    top: detection.top,
                    right: detection.left,
                    bottom: detection.bottom,
                },
            );
        }
        return sample_band_metrics(
            rgba,
            width,
            height,
            RectBox {
                left: detection.right,
                top: detection.top,
                right: (detection.right + band_span).min(width),
                bottom: detection.bottom,
            },
        );
    }

    if toward_start {
        let top = detection.top.saturating_sub(band_span);
        return sample_band_metrics(
            rgba,
            width,
            height,
            RectBox {
                left: detection.left,
                top,
                right: detection.right,
                bottom: detection.top,
            },
        );
    }

    sample_band_metrics(
        rgba,
        width,
        height,
        RectBox {
            left: detection.left,
            top: detection.bottom,
            right: detection.right,
            bottom: (detection.bottom + band_span).min(height),
        },
    )
}

fn sample_band_metrics(rgba: &[u8], width: usize, _height: usize, rect: RectBox) -> BandMetrics {
    if rect.right <= rect.left || rect.bottom <= rect.top {
        return BandMetrics {
            colored_ratio: 0.0,
            separator_ratio: 0.0,
        };
    }

    let mut colored_hits = 0_usize;
    let mut separator_hits = 0_usize;
    let mut total = 0_usize;

    for y in rect.top..rect.bottom {
        for x in rect.left..rect.right {
            let index = (y * width + x) * 4;
            let pixel = [
                rgba[index],
                rgba[index + 1],
                rgba[index + 2],
                rgba[index + 3],
            ];
            if is_colored_content_pixel(pixel) {
                colored_hits += 1;
            }
            if is_light_separator_pixel([pixel[0], pixel[1], pixel[2]]) {
                separator_hits += 1;
            }
            total += 1;
        }
    }

    BandMetrics {
        colored_ratio: colored_hits as f32 / total.max(1) as f32,
        separator_ratio: separator_hits as f32 / total.max(1) as f32,
    }
}
