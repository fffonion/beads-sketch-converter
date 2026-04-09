use std::slice;

static mut RESULT: [i32; 7] = [0; 7];

#[unsafe(no_mangle)]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(size);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

#[unsafe(no_mangle)]
pub extern "C" fn dealloc(ptr: *mut u8, capacity: usize) {
    if ptr.is_null() || capacity == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, 0, capacity));
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn result_ptr() -> *const i32 {
    (&raw const RESULT).cast::<i32>()
}

#[unsafe(no_mangle)]
pub extern "C" fn detect_chart(ptr: *const u8, len: usize, width: u32, height: u32) -> u32 {
    let width = width as usize;
    let height = height as usize;
    let expected_len = width.saturating_mul(height).saturating_mul(4);
    if ptr.is_null() || len < expected_len || width < 96 || height < 96 {
        write_result(None);
        return 0;
    }

    let rgba = unsafe { slice::from_raw_parts(ptr, expected_len) };
    let detection = detect_chart_inner(rgba, width, height);
    write_result(detection);
    unsafe { RESULT[0] as u32 }
}

#[derive(Clone, Copy)]
struct Detection {
    left: usize,
    top: usize,
    right: usize,
    bottom: usize,
    grid_width: usize,
    grid_height: usize,
}

#[derive(Clone, Copy)]
struct LinePair {
    start: usize,
    end: usize,
}

fn write_result(result: Option<Detection>) {
    unsafe {
        if let Some(detection) = result {
            RESULT[0] = 1;
            RESULT[1] = detection.left as i32;
            RESULT[2] = detection.top as i32;
            RESULT[3] = detection.right as i32;
            RESULT[4] = detection.bottom as i32;
            RESULT[5] = detection.grid_width as i32;
            RESULT[6] = detection.grid_height as i32;
        } else {
            RESULT = [0; 7];
        }
    }
}

fn detect_chart_inner(rgba: &[u8], width: usize, height: usize) -> Option<Detection> {
    let luma = build_luma(rgba, width, height);
    let mut column_projection = build_column_edge_projection(&luma, width, height);
    let mut row_projection = build_row_edge_projection(&luma, width, height);
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
        &luma,
        width,
        horizontal.start,
        horizontal.end,
        vertical.start,
        vertical.end,
        true,
    )?;
    let y_period = dominant_period_for_crop(
        &luma,
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
    let grid_width = ((inner_width as f32) / (x_period as f32)).round() as usize;
    let grid_height = ((inner_height as f32) / (y_period as f32)).round() as usize;
    if !(10..=102).contains(&grid_width) || !(10..=102).contains(&grid_height) {
        return None;
    }

    let crop_aspect = inner_width as f32 / inner_height.max(1) as f32;
    let grid_aspect = grid_width as f32 / grid_height.max(1) as f32;
    let aspect_ratio = if crop_aspect > grid_aspect {
        crop_aspect / grid_aspect
    } else {
        grid_aspect / crop_aspect
    };
    if aspect_ratio > 1.28 {
        return None;
    }

    Some(Detection {
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
    })
}

fn build_luma(rgba: &[u8], width: usize, height: usize) -> Vec<f32> {
    let mut output = vec![0.0; width * height];
    for index in 0..(width * height) {
        let base = index * 4;
        let r = rgba[base] as f32;
        let g = rgba[base + 1] as f32;
        let b = rgba[base + 2] as f32;
        output[index] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    output
}

fn build_column_edge_projection(luma: &[f32], width: usize, height: usize) -> Vec<f32> {
    let mut projection = vec![0.0; width];
    for y in 1..height.saturating_sub(1) {
        let row = y * width;
        for x in 1..width.saturating_sub(1) {
            let gx = (luma[row + x + 1] - luma[row + x - 1]).abs();
            let gy = (luma[row + x + width] - luma[row + x - width]).abs();
            projection[x] += gx + gy * 0.15;
        }
    }
    projection
}

fn build_row_edge_projection(luma: &[f32], width: usize, height: usize) -> Vec<f32> {
    let mut projection = vec![0.0; height];
    for y in 1..height.saturating_sub(1) {
        let row = y * width;
        for x in 1..width.saturating_sub(1) {
            let gx = (luma[row + x + 1] - luma[row + x - 1]).abs();
            let gy = (luma[row + x + width] - luma[row + x - width]).abs();
            projection[y] += gy + gx * 0.15;
        }
    }
    projection
}

fn smooth_projection(values: &mut [f32], radius: usize) {
    if values.len() < 3 || radius == 0 {
        return;
    }

    let source = values.to_vec();
    for index in 0..values.len() {
        let start = index.saturating_sub(radius);
        let end = (index + radius + 1).min(values.len());
        let mut sum = 0.0;
        for value in &source[start..end] {
            sum += *value;
        }
        values[index] = sum / (end - start) as f32;
    }
}

fn projection_mean(values: &[f32]) -> f32 {
    values.iter().sum::<f32>() / values.len().max(1) as f32
}

fn projection_std(values: &[f32], mean: f32) -> f32 {
    let variance = values
        .iter()
        .map(|value| {
            let delta = *value - mean;
            delta * delta
        })
        .sum::<f32>()
        / values.len().max(1) as f32;
    variance.sqrt()
}

fn find_local_peaks(values: &[f32], max_peaks: usize, min_distance: usize) -> Vec<usize> {
    if values.len() < 3 {
        return Vec::new();
    }

    let mean = projection_mean(values);
    let std = projection_std(values, mean);
    let threshold = mean + std * 0.65;

    let mut peaks = Vec::<(usize, f32)>::new();
    for index in 1..values.len() - 1 {
        let value = values[index];
        if value < threshold || value < values[index - 1] || value < values[index + 1] {
            continue;
        }
        peaks.push((index, value));
    }

    peaks.sort_by(|left, right| right.1.total_cmp(&left.1));
    let mut chosen = Vec::<usize>::new();
    for (index, _) in peaks {
        if chosen
            .iter()
            .any(|other| other.abs_diff(index) < min_distance)
        {
            continue;
        }
        chosen.push(index);
        if chosen.len() >= max_peaks {
            break;
        }
    }
    chosen.sort_unstable();
    chosen
}

fn choose_outer_pair(projection: &[f32], peaks: &[usize], full_span: usize) -> Option<LinePair> {
    if peaks.len() < 2 {
        return None;
    }

    let mut best_pair: Option<LinePair> = None;
    let mut best_score = f32::NEG_INFINITY;
    for (left_index, left) in peaks.iter().enumerate() {
        for right in peaks.iter().skip(left_index + 1) {
            let span = right.saturating_sub(*left);
            let span_ratio = span as f32 / full_span.max(1) as f32;
            if !(0.45..=0.98).contains(&span_ratio) {
                continue;
            }

            let left_margin = *left as f32 / full_span.max(1) as f32;
            let right_margin = (full_span.saturating_sub(*right)) as f32 / full_span.max(1) as f32;
            if left_margin > 0.24 || right_margin > 0.24 {
                continue;
            }

            let balance = 1.0 - (left_margin - right_margin).abs().min(0.18) / 0.18;
            let score = projection[*left]
                + projection[*right]
                + (span_ratio * 0.35 + balance * 0.25) * projection_mean(projection);

            if score > best_score {
                best_score = score;
                best_pair = Some(LinePair {
                    start: *left,
                    end: *right,
                });
            }
        }
    }

    best_pair
}

fn border_colors_are_consistent(
    rgba: &[u8],
    width: usize,
    height: usize,
    horizontal: LinePair,
    vertical: LinePair,
) -> bool {
    if horizontal.end <= horizontal.start + 8 || vertical.end <= vertical.start + 8 {
        return false;
    }

    let top = sample_horizontal_border_color(rgba, width, height, horizontal.start, horizontal.end, vertical.start);
    let bottom =
        sample_horizontal_border_color(rgba, width, height, horizontal.start, horizontal.end, vertical.end);
    let left = sample_vertical_border_color(rgba, width, height, horizontal.start, vertical.start, vertical.end);
    let right = sample_vertical_border_color(rgba, width, height, horizontal.end, vertical.start, vertical.end);

    let colors = [top, bottom, left, right];
    let max_variance = colors
        .iter()
        .map(|color| color.variance)
        .fold(0.0_f32, f32::max);
    if max_variance > 38.0 {
        return false;
    }

    let mut total_distance = 0.0;
    let mut distance_count = 0.0;
    for outer in 0..colors.len() {
        for inner in outer + 1..colors.len() {
            total_distance += color_distance(colors[outer].mean, colors[inner].mean);
            distance_count += 1.0;
        }
    }
    if distance_count <= 0.0 {
        return false;
    }

    let mean_border_distance = total_distance / distance_count;
    if mean_border_distance > 42.0 {
        return false;
    }

    let interior = sample_center_color(
        rgba,
        width,
        height,
        horizontal.start,
        horizontal.end,
        vertical.start,
        vertical.end,
    );
    color_distance(top.mean, interior.mean) > 6.0
}

#[derive(Clone, Copy)]
struct SampledColor {
    mean: [f32; 3],
    variance: f32,
}

fn sample_horizontal_border_color(
    rgba: &[u8],
    width: usize,
    height: usize,
    left: usize,
    right: usize,
    y: usize,
) -> SampledColor {
    let start = left + ((right - left) as f32 * 0.2) as usize;
    let end = right.saturating_sub(((right - left) as f32 * 0.2) as usize);
    sample_strip_color(rgba, width, height, start, end, y, y.saturating_add(1))
}

fn sample_vertical_border_color(
    rgba: &[u8],
    width: usize,
    height: usize,
    x: usize,
    top: usize,
    bottom: usize,
) -> SampledColor {
    let start = top + ((bottom - top) as f32 * 0.2) as usize;
    let end = bottom.saturating_sub(((bottom - top) as f32 * 0.2) as usize);
    sample_strip_color(rgba, width, height, x, x.saturating_add(1), start, end)
}

fn sample_center_color(
    rgba: &[u8],
    width: usize,
    height: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
) -> SampledColor {
    let inner_left = left + ((right - left) as f32 * 0.25) as usize;
    let inner_right = right.saturating_sub(((right - left) as f32 * 0.25) as usize);
    let inner_top = top + ((bottom - top) as f32 * 0.25) as usize;
    let inner_bottom = bottom.saturating_sub(((bottom - top) as f32 * 0.25) as usize);
    sample_strip_color(rgba, width, height, inner_left, inner_right, inner_top, inner_bottom)
}

fn sample_strip_color(
    rgba: &[u8],
    width: usize,
    height: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
) -> SampledColor {
    let safe_left = left.min(width.saturating_sub(1));
    let safe_right = right.min(width);
    let safe_top = top.min(height.saturating_sub(1));
    let safe_bottom = bottom.min(height);
    let mut sum = [0.0_f32; 3];
    let mut values = Vec::<[f32; 3]>::new();

    for y in safe_top..safe_bottom.max(safe_top + 1) {
        for x in safe_left..safe_right.max(safe_left + 1) {
            let index = (y * width + x) * 4;
            let color = [
                rgba[index] as f32,
                rgba[index + 1] as f32,
                rgba[index + 2] as f32,
            ];
            sum[0] += color[0];
            sum[1] += color[1];
            sum[2] += color[2];
            values.push(color);
        }
    }

    let count = values.len().max(1) as f32;
    let mean = [sum[0] / count, sum[1] / count, sum[2] / count];
    let variance = values
        .iter()
        .map(|value| color_distance(*value, mean))
        .sum::<f32>()
        / count;

    SampledColor { mean, variance }
}

fn color_distance(left: [f32; 3], right: [f32; 3]) -> f32 {
    let dr = left[0] - right[0];
    let dg = left[1] - right[1];
    let db = left[2] - right[2];
    (dr * dr + dg * dg + db * db).sqrt()
}

fn dominant_period_for_crop(
    luma: &[f32],
    width: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
    vertical_lines: bool,
) -> Option<usize> {
    let projection = if vertical_lines {
        build_crop_column_projection(luma, width, left, right, top, bottom)
    } else {
        build_crop_row_projection(luma, width, left, right, top, bottom)
    };
    if projection.len() < 24 {
        return None;
    }

    let mean = projection_mean(&projection);
    let mut centered = projection;
    for value in &mut centered {
        *value = (*value - mean).max(0.0);
    }
    if centered.iter().all(|value| *value <= 0.0) {
        return None;
    }

    let min_period = 3;
    let max_period = (centered.len() / 8).clamp(8, 96);
    let mut best_period = 0;
    let mut best_score = f32::NEG_INFINITY;

    for period in min_period..=max_period {
        let cell_count = ((centered.len() as f32) / period as f32).round() as usize;
        if !(10..=102).contains(&cell_count) {
          continue;
        }

        let mut correlation = 0.0;
        let mut samples = 0.0;
        for index in 0..centered.len().saturating_sub(period) {
            correlation += centered[index] * centered[index + period];
            samples += 1.0;
        }
        if samples <= 0.0 {
            continue;
        }

        let normalized = correlation / samples;
        let exact_period = centered.len() as f32 / cell_count as f32;
        let fit_penalty = 1.0 - ((exact_period - period as f32).abs() / period as f32).min(0.35);
        let score = normalized * fit_penalty;
        if score > best_score {
            best_score = score;
            best_period = period;
        }
    }

    if best_period == 0 {
        None
    } else {
        Some(best_period)
    }
}

fn build_crop_column_projection(
    luma: &[f32],
    width: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
) -> Vec<f32> {
    let safe_left = left.saturating_add(1);
    let safe_right = right.saturating_sub(1);
    let safe_top = top.saturating_add(1);
    let safe_bottom = bottom.saturating_sub(1);
    let mut projection = vec![0.0; safe_right.saturating_sub(safe_left).max(1)];

    for y in safe_top..safe_bottom {
        let row = y * width;
        for x in safe_left..safe_right {
            projection[x - safe_left] += (luma[row + x + 1] - luma[row + x - 1]).abs();
        }
    }

    smooth_projection(&mut projection, 3);
    projection
}

fn build_crop_row_projection(
    luma: &[f32],
    width: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
) -> Vec<f32> {
    let safe_left = left.saturating_add(1);
    let safe_right = right.saturating_sub(1);
    let safe_top = top.saturating_add(1);
    let safe_bottom = bottom.saturating_sub(1);
    let mut projection = vec![0.0; safe_bottom.saturating_sub(safe_top).max(1)];

    for y in safe_top..safe_bottom {
        let row = y * width;
        for x in safe_left..safe_right {
            projection[y - safe_top] += (luma[row + x + width] - luma[row + x - width]).abs();
        }
    }

    smooth_projection(&mut projection, 3);
    projection
}
