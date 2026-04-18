use crate::detector_signal::{
    build_column_edge_projection, build_luma, build_row_edge_projection, smooth_projection,
};
use crate::fft::estimate_period_from_fft;
use std::collections::HashMap;

struct StrokeMaskContext<'a> {
    luma: &'a [f32],
    blurred_luma: &'a [f32],
    detail_luma: &'a [f32],
    strong_mask: &'a [u8],
    connected_mask: &'a [u8],
    width: usize,
    height: usize,
    bridge_span: usize,
    strength_norm: f32,
}

struct StrokeNeighborContext<'a> {
    rgba: &'a [u8],
    stroke_mask: &'a [u8],
    strong_mask: &'a [u8],
    connected_mask: &'a [u8],
    luma: &'a [f32],
    detail_luma: &'a [f32],
    width: usize,
    height: usize,
}

pub(crate) fn enhance_edges_fft_in_place(
    rgba: &mut [u8],
    width: usize,
    height: usize,
    strength: f32,
) -> bool {
    if width < 3 || height < 3 {
        return false;
    }

    let strength = strength.clamp(0.0, 100.0);
    if strength <= 0.0 {
        return false;
    }

    let source = rgba.to_vec();
    let luma = build_luma(&source, width, height);
    let blurred = box_blur_rgba(&source, width, height);
    let blurred_luma = build_luma(&blurred, width, height);
    let detail_luma = luma
        .iter()
        .zip(blurred_luma.iter())
        .map(|(base, blur)| base - blur)
        .collect::<Vec<_>>();

    let dominant_period = estimate_dominant_edge_period(&luma, width, height);
    let strength_norm = strength / 100.0;
    let strength_response = strength_norm;
    let bridge_span = (1.0 + strength_response * ((dominant_period * 0.24) + 2.0))
        .round()
        .clamp(1.0, 6.0) as usize;
    let dilation_radius = (1.0 + strength_response * ((dominant_period * 0.14) + 1.6))
        .round()
        .clamp(1.0, 3.0) as usize;
    let (strong_mask, connected_mask) = build_edge_masks(
        &luma,
        width,
        height,
        bridge_span,
        dilation_radius,
        strength_response,
    );
    let stroke_mask_context = StrokeMaskContext {
        luma: &luma,
        blurred_luma: &blurred_luma,
        detail_luma: &detail_luma,
        strong_mask: &strong_mask,
        connected_mask: &connected_mask,
        width,
        height,
        bridge_span: bridge_span.min(4),
        strength_norm: strength_response,
    };
    let (stroke_mask, bridge_mask) = build_stroke_masks(&stroke_mask_context);
    if strong_mask.iter().all(|value| *value == 0) || connected_mask.iter().all(|value| *value == 0)
    {
        return false;
    }

    let core_boost = 1.86 * strength_response;
    let bridge_boost = 0.94 * strength_response;
    let stroke_mix = 0.76 * strength_response;
    let bridge_mix = 0.64 * strength_response;
    let neighbor_radius = (bridge_span + dilation_radius).clamp(2, 5);
    let neighbor_context = StrokeNeighborContext {
        rgba: &source,
        stroke_mask: &stroke_mask,
        strong_mask: &strong_mask,
        connected_mask: &connected_mask,
        luma: &luma,
        detail_luma: &detail_luma,
        width,
        height,
    };
    let mut changed = false;

    for y in 0..height {
        for x in 0..width {
            let pixel_index = y * width + x;
            let is_stroke = stroke_mask[pixel_index] != 0;
            let is_bridge = bridge_mask[pixel_index] != 0;
            if !is_stroke && !is_bridge {
                continue;
            }

            let base = pixel_index * 4;
            let boost = if is_stroke { core_boost } else { bridge_boost };
            let neighbor = sample_stroke_neighbor_color(
                &neighbor_context,
                luma[pixel_index],
                x,
                y,
                neighbor_radius,
            );

            for channel in 0..3 {
                let source_value = source[base + channel] as f32;
                let blur_value = blurred[base + channel] as f32;
                let mut value = source_value + (source_value - blur_value) * boost;
                if let Some(target) = neighbor {
                    let mix = if is_stroke { stroke_mix } else { bridge_mix };
                    value = value * (1.0 - mix) + target[channel] * mix;
                    let halo_allowance = if is_stroke {
                        14.0 + (1.0 - strength_response) * 8.0
                    } else {
                        18.0 + (1.0 - strength_response) * 10.0
                    };
                    value = value.min((target[channel] + halo_allowance).max(source_value));
                }
                if is_stroke {
                    value -=
                        (16.0 * strength_response) * ((220.0 - luma[pixel_index]).max(0.0) / 220.0);
                }
                let next = value.round().clamp(0.0, 255.0) as u8;
                if next != rgba[base + channel] {
                    changed = true;
                }
                rgba[base + channel] = next;
            }
            rgba[base + 3] = source[base + 3];
        }
    }

    changed
}

fn estimate_dominant_edge_period(luma: &[f32], width: usize, height: usize) -> f32 {
    let mut x_projection = build_column_edge_projection(luma, width, height);
    let mut y_projection = build_row_edge_projection(luma, width, height);
    smooth_projection(&mut x_projection, 1);
    smooth_projection(&mut y_projection, 1);

    let mut periods = Vec::<f32>::new();
    if let Some(period) = estimate_period_from_fft(&x_projection) {
        periods.push(period as f32);
    }
    if let Some(period) = estimate_period_from_fft(&y_projection) {
        periods.push(period as f32);
    }
    if periods.is_empty() {
        return (width.min(height) as f32 / 18.0).clamp(6.0, 22.0);
    }

    periods.sort_by(|left, right| left.total_cmp(right));
    if periods.len() % 2 == 1 {
        periods[periods.len() / 2]
    } else {
        (periods[periods.len() / 2 - 1] + periods[periods.len() / 2]) * 0.5
    }
}

fn build_edge_masks(
    luma: &[f32],
    width: usize,
    height: usize,
    bridge_span: usize,
    dilation_radius: usize,
    strength_norm: f32,
) -> (Vec<u8>, Vec<u8>) {
    let pixel_count = width * height;
    let mut gradients = vec![0.0_f32; pixel_count];
    let mut sum = 0.0_f32;
    let mut count = 0_usize;
    let mut max_gradient = 0.0_f32;

    for y in 1..height.saturating_sub(1) {
        let row = y * width;
        for x in 1..width.saturating_sub(1) {
            let index = row + x;
            let gx = (luma[index + 1] - luma[index - 1]).abs();
            let gy = (luma[index + width] - luma[index - width]).abs();
            let gradient = (gx * gx + gy * gy).sqrt();
            gradients[index] = gradient;
            sum += gradient;
            count += 1;
            if gradient > max_gradient {
                max_gradient = gradient;
            }
        }
    }

    if count == 0 || max_gradient < 2.0 {
        return (vec![0; pixel_count], vec![0; pixel_count]);
    }

    let mean = sum / count as f32;
    let mut variance_sum = 0.0_f32;
    for y in 1..height.saturating_sub(1) {
        let row = y * width;
        for x in 1..width.saturating_sub(1) {
            let delta = gradients[row + x] - mean;
            variance_sum += delta * delta;
        }
    }
    let deviation = (variance_sum / count as f32).sqrt();
    let high_threshold = (mean + deviation * (0.68 - strength_norm * 0.16).max(0.42))
        .max(max_gradient * (0.17 - strength_norm * 0.05).max(0.1));
    let low_threshold = high_threshold * (0.54 + strength_norm * 0.08);

    let mut strong_mask = vec![0_u8; pixel_count];
    let mut support_mask = vec![0_u8; pixel_count];
    for y in 1..height.saturating_sub(1) {
        let row = y * width;
        for x in 1..width.saturating_sub(1) {
            let index = row + x;
            let gradient = gradients[index];
            if gradient >= low_threshold {
                support_mask[index] = 1;
            }
            if gradient >= high_threshold {
                strong_mask[index] = 1;
            }
        }
    }

    let horizontal_bridge = bridge_mask_rows(&strong_mask, width, height, bridge_span);
    let vertical_bridge = bridge_mask_columns(&strong_mask, width, height, bridge_span);
    let mut combined = support_mask;
    for index in 0..pixel_count {
        if strong_mask[index] != 0 || horizontal_bridge[index] != 0 || vertical_bridge[index] != 0 {
            combined[index] = 1;
        }
    }

    let smoothed = majority_smooth_mask(&combined, width, height);
    let mut connected = dilate_mask(&smoothed, width, height, dilation_radius);
    for index in 0..pixel_count {
        if strong_mask[index] != 0 || combined[index] != 0 {
            connected[index] = 1;
        }
    }

    (strong_mask, connected)
}

fn build_stroke_masks(context: &StrokeMaskContext<'_>) -> (Vec<u8>, Vec<u8>) {
    let pixel_count = context.width * context.height;
    let mut seed_mask = vec![0_u8; pixel_count];
    let dark_side_threshold = 2.0 + context.strength_norm * 6.0;

    for (index, seed) in seed_mask.iter_mut().enumerate() {
        if context.connected_mask[index] == 0 {
            continue;
        }

        let dark_side = context.detail_luma[index] <= -dark_side_threshold
            || context.luma[index] + dark_side_threshold < context.blurred_luma[index];
        if dark_side && context.luma[index] < 245.0 {
            *seed = 1;
        }
    }

    if seed_mask.iter().all(|value| *value == 0) {
        for (index, seed) in seed_mask.iter_mut().enumerate() {
            if context.connected_mask[index] != 0
                && context.strong_mask[index] != 0
                && context.luma[index] < 220.0
            {
                *seed = 1;
            }
        }
    }

    let horizontal_bridge = bridge_mask_rows(
        &seed_mask,
        context.width,
        context.height,
        context.bridge_span,
    );
    let vertical_bridge = bridge_mask_columns(
        &seed_mask,
        context.width,
        context.height,
        context.bridge_span,
    );
    let mut bridge_mask = vec![0_u8; pixel_count];
    for index in 0..pixel_count {
        if context.connected_mask[index] == 0 || seed_mask[index] != 0 {
            continue;
        }
        bridge_mask[index] = u8::from(horizontal_bridge[index] != 0 || vertical_bridge[index] != 0);
    }

    for (index, seed) in seed_mask.iter_mut().enumerate() {
        *seed = u8::from(*seed != 0 && context.connected_mask[index] != 0);
    }

    (seed_mask, bridge_mask)
}

fn bridge_mask_rows(mask: &[u8], width: usize, height: usize, max_gap: usize) -> Vec<u8> {
    let mut output = mask.to_vec();
    if max_gap == 0 {
        return output;
    }

    for y in 0..height {
        let row = y * width;
        let mut last_edge: Option<usize> = None;
        for x in 0..width {
            if mask[row + x] == 0 {
                continue;
            }

            if let Some(previous) = last_edge {
                let gap = x.saturating_sub(previous + 1);
                if gap > 0 && gap <= max_gap {
                    for fill in previous + 1..x {
                        output[row + fill] = 1;
                    }
                }
            }
            last_edge = Some(x);
        }
    }

    output
}

fn bridge_mask_columns(mask: &[u8], width: usize, height: usize, max_gap: usize) -> Vec<u8> {
    let mut output = mask.to_vec();
    if max_gap == 0 {
        return output;
    }

    for x in 0..width {
        let mut last_edge: Option<usize> = None;
        for y in 0..height {
            let index = y * width + x;
            if mask[index] == 0 {
                continue;
            }

            if let Some(previous) = last_edge {
                let gap = y.saturating_sub(previous + 1);
                if gap > 0 && gap <= max_gap {
                    for fill in previous + 1..y {
                        output[fill * width + x] = 1;
                    }
                }
            }
            last_edge = Some(y);
        }
    }

    output
}

fn majority_smooth_mask(mask: &[u8], width: usize, height: usize) -> Vec<u8> {
    let mut output = vec![0_u8; mask.len()];
    for y in 0..height {
        for x in 0..width {
            let mut active = 0_u8;
            for sample_y in y.saturating_sub(1)..=(y + 1).min(height.saturating_sub(1)) {
                for sample_x in x.saturating_sub(1)..=(x + 1).min(width.saturating_sub(1)) {
                    active += mask[sample_y * width + sample_x];
                }
            }

            let index = y * width + x;
            output[index] = if mask[index] != 0 {
                u8::from(active >= 3)
            } else {
                u8::from(active >= 5)
            };
        }
    }
    output
}

fn dilate_mask(mask: &[u8], width: usize, height: usize, radius: usize) -> Vec<u8> {
    let mut output = mask.to_vec();
    if radius == 0 {
        return output;
    }

    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            if mask[index] == 0 {
                continue;
            }

            for sample_y in y.saturating_sub(radius)..=(y + radius).min(height.saturating_sub(1)) {
                for sample_x in x.saturating_sub(radius)..=(x + radius).min(width.saturating_sub(1))
                {
                    output[sample_y * width + sample_x] = 1;
                }
            }
        }
    }

    output
}

fn sample_stroke_neighbor_color(
    context: &StrokeNeighborContext<'_>,
    source_luma: f32,
    x: usize,
    y: usize,
    radius: usize,
) -> Option<[f32; 3]> {
    let mut buckets = HashMap::<u16, StrokeColorBucket>::new();
    let max_candidate_luma = (source_luma + 48.0).min(208.0);

    for sample_y in y.saturating_sub(radius)..=(y + radius).min(context.height.saturating_sub(1)) {
        for sample_x in x.saturating_sub(radius)..=(x + radius).min(context.width.saturating_sub(1))
        {
            let index = sample_y * context.width + sample_x;
            if context.luma[index] > max_candidate_luma {
                continue;
            }

            let distance = x.abs_diff(sample_x).max(y.abs_diff(sample_y)) as f32;
            let structure_bonus = if context.stroke_mask[index] != 0 {
                56.0
            } else if context.strong_mask[index] != 0 {
                24.0
            } else if context.connected_mask[index] != 0 {
                8.0
            } else {
                0.0
            };
            let weight = (255.0 - context.luma[index]).max(12.0)
                + context.detail_luma[index].abs() * 3.0
                + (radius as f32 - distance).max(0.0) * 14.0
                + structure_bonus;
            let base = index * 4;
            let bucket_key = quantize_stroke_color_bucket(
                context.rgba[base],
                context.rgba[base + 1],
                context.rgba[base + 2],
            );
            let bucket = buckets.entry(bucket_key).or_default();
            bucket.weight_sum += weight;
            bucket.weighted_rgb_sum[0] += context.rgba[base] as f32 * weight;
            bucket.weighted_rgb_sum[1] += context.rgba[base + 1] as f32 * weight;
            bucket.weighted_rgb_sum[2] += context.rgba[base + 2] as f32 * weight;
            bucket.weighted_luma_sum += context.luma[index] * weight;
        }
    }

    let dominant_bucket = buckets.values().max_by(|left, right| {
        left.weight_sum.total_cmp(&right.weight_sum).then_with(|| {
            let left_luma = left.weighted_luma_sum / left.weight_sum.max(1e-6);
            let right_luma = right.weighted_luma_sum / right.weight_sum.max(1e-6);
            right_luma.total_cmp(&left_luma)
        })
    })?;

    Some([
        dominant_bucket.weighted_rgb_sum[0] / dominant_bucket.weight_sum,
        dominant_bucket.weighted_rgb_sum[1] / dominant_bucket.weight_sum,
        dominant_bucket.weighted_rgb_sum[2] / dominant_bucket.weight_sum,
    ])
}

#[derive(Default)]
struct StrokeColorBucket {
    weight_sum: f32,
    weighted_rgb_sum: [f32; 3],
    weighted_luma_sum: f32,
}

fn quantize_stroke_color_bucket(red: u8, green: u8, blue: u8) -> u16 {
    let red_bucket = (red / 32) as u16;
    let green_bucket = (green / 32) as u16;
    let blue_bucket = (blue / 32) as u16;
    (red_bucket << 6) | (green_bucket << 3) | blue_bucket
}

fn box_blur_rgba(rgba: &[u8], width: usize, height: usize) -> Vec<u8> {
    let mut output = vec![0_u8; rgba.len()];
    for y in 0..height {
        for x in 0..width {
            let mut sum = [0_u32; 3];
            let mut count = 0_u32;
            for sample_y in y.saturating_sub(1)..=(y + 1).min(height.saturating_sub(1)) {
                for sample_x in x.saturating_sub(1)..=(x + 1).min(width.saturating_sub(1)) {
                    let base = (sample_y * width + sample_x) * 4;
                    sum[0] += rgba[base] as u32;
                    sum[1] += rgba[base + 1] as u32;
                    sum[2] += rgba[base + 2] as u32;
                    count += 1;
                }
            }

            let base = (y * width + x) * 4;
            output[base] = ((sum[0] as f32) / count as f32).round() as u8;
            output[base + 1] = ((sum[1] as f32) / count as f32).round() as u8;
            output[base + 2] = ((sum[2] as f32) / count as f32).round() as u8;
            output[base + 3] = rgba[base + 3];
        }
    }
    output
}
