use crate::fft::estimate_period_from_fft;
use crate::types::{Detection, LinePair};

pub(crate) fn build_luma(rgba: &[u8], width: usize, height: usize) -> Vec<f32> {
    let mut output = vec![0.0; width * height];
    for (index, value) in output.iter_mut().enumerate().take(width * height) {
        let base = index * 4;
        let r = rgba[base] as f32;
        let g = rgba[base + 1] as f32;
        let b = rgba[base + 2] as f32;
        *value = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    output
}

pub(crate) fn detect_strong_guide_family(
    rgba: &[u8],
    width: usize,
    height: usize,
    crop_box: Detection,
    along_x: bool,
) -> Option<(usize, usize, usize)> {
    let signal = build_guide_coverage_signal(rgba, width, height, crop_box, along_x);
    let peaks = find_strong_guide_peaks(&signal);
    if peaks.len() < 5 {
        return None;
    }

    let mut diffs = Vec::<usize>::new();
    for index in 0..peaks.len().saturating_sub(1) {
        let diff = peaks[index + 1].saturating_sub(peaks[index]);
        if (120..=320).contains(&diff) {
            diffs.push(diff);
        }
    }
    if diffs.len() < 4 {
        return None;
    }

    let period = median_usize(&mut diffs);
    if !(120..=320).contains(&period) {
        return None;
    }

    let start = if along_x { crop_box.left } else { crop_box.top };
    let first_seed = peaks[0];
    let aligned_peaks: Vec<usize> = peaks
        .into_iter()
        .filter(|peak| {
            let diff = peak.abs_diff(first_seed) % period;
            diff <= 18 || period.saturating_sub(diff) <= 18
        })
        .collect();
    let first_peak = *aligned_peaks.first()?;
    let last_peak = *aligned_peaks.last()?;
    if first_peak > start + period {
        return None;
    }

    Some((period, first_peak, last_peak))
}

fn build_guide_coverage_signal(
    rgba: &[u8],
    width: usize,
    height: usize,
    crop_box: Detection,
    along_x: bool,
) -> Vec<f32> {
    let axis_length = if along_x { width } else { height };
    let start = if along_x { crop_box.top } else { crop_box.left };
    let end = if along_x {
        crop_box.bottom
    } else {
        crop_box.right
    };
    let other_length = end.saturating_sub(start).max(1);
    let mut signal = vec![0.0_f32; axis_length];
    let mut counts = [0_u16; 32];

    for (line, bucket_signal) in signal.iter_mut().enumerate().take(axis_length) {
        counts.fill(0);
        let mut candidates = 0_usize;
        let mut dominant = 0_u16;
        for offset in start..end {
            let (x, y) = if along_x {
                (line, offset)
            } else {
                (offset, line)
            };
            let index = (y * width + x) * 4;
            let pixel = [
                rgba[index],
                rgba[index + 1],
                rgba[index + 2],
                rgba[index + 3],
            ];
            let Some(bucket) = classify_guide_bucket(pixel) else {
                continue;
            };
            candidates += 1;
            let bucket_index = bucket as usize;
            counts[bucket_index] = counts[bucket_index].saturating_add(1);
            dominant = dominant.max(counts[bucket_index]);
        }
        if candidates == 0 {
            continue;
        }
        let dominant_ratio = dominant as f32 / candidates.max(1) as f32;
        let line_coverage = dominant as f32 / other_length as f32;
        if dominant_ratio >= 0.5 && line_coverage >= 0.015 {
            *bucket_signal = line_coverage;
        }
    }

    smooth_projection(&mut signal, 2);
    signal
}

fn find_strong_guide_peaks(signal: &[f32]) -> Vec<usize> {
    let mean = projection_mean(signal);
    let mut max_value = 0.0_f32;
    for value in signal {
        max_value = max_value.max(*value);
    }

    let threshold = (max_value * 0.6).max(mean + 0.05).max(0.08);
    let mut peaks = Vec::<usize>::new();
    for index in 1..signal.len().saturating_sub(1) {
        let value = signal[index];
        if value < threshold || value < signal[index - 1] || value < signal[index + 1] {
            continue;
        }
        if let Some(last) = peaks.last_mut()
            && index.saturating_sub(*last) <= 8
        {
            if value > signal[*last] {
                *last = index;
            }
            continue;
        }
        peaks.push(index);
    }
    peaks
}

fn classify_guide_bucket(pixel: [u8; 4]) -> Option<u8> {
    if pixel[3] < 16 {
        return None;
    }

    let red = pixel[0] as f32;
    let green = pixel[1] as f32;
    let blue = pixel[2] as f32;
    let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    let chroma = red.max(green).max(blue) - red.min(green).min(blue);
    if !(18.0..=245.0).contains(&luminance) {
        return None;
    }
    if chroma >= 20.0 {
        return Some(quantize_hue_bucket(red, green, blue));
    }
    if chroma <= 28.0 && luminance <= 132.0 {
        return Some(24);
    }
    None
}

fn quantize_hue_bucket(red: f32, green: f32, blue: f32) -> u8 {
    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    let chroma = max - min;
    if chroma <= 0.0 {
        return 24;
    }

    let hue = if (max - red).abs() < f32::EPSILON {
        ((green - blue) / chroma).rem_euclid(6.0)
    } else if (max - green).abs() < f32::EPSILON {
        ((blue - red) / chroma) + 2.0
    } else {
        ((red - green) / chroma) + 4.0
    } * 60.0;

    ((hue / 15.0).floor() as i32).clamp(0, 23) as u8
}

pub(crate) fn is_content_pixel(pixel: [u8; 4]) -> bool {
    if pixel[3] < 16 {
        return false;
    }

    let red = pixel[0] as f32;
    let green = pixel[1] as f32;
    let blue = pixel[2] as f32;
    let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    let chroma = red.max(green).max(blue) - red.min(green).min(blue);
    luminance <= 244.0 || chroma >= 10.0
}

pub(crate) fn is_colored_content_pixel(pixel: [u8; 4]) -> bool {
    if pixel[3] < 16 {
        return false;
    }

    let red = pixel[0] as f32;
    let green = pixel[1] as f32;
    let blue = pixel[2] as f32;
    let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    let chroma = red.max(green).max(blue) - red.min(green).min(blue);
    luminance < 242.0 && chroma > 18.0
}

pub(crate) fn count_unique_colors_rough(rgba: &[u8], width: usize, detection: Detection) -> usize {
    let crop_width = detection.right.saturating_sub(detection.left).max(1);
    let crop_height = detection.bottom.saturating_sub(detection.top).max(1);
    let step_x = (crop_width / 96).max(1);
    let step_y = (crop_height / 96).max(1);
    let mut colors = std::collections::BTreeSet::<u16>::new();

    for y in (detection.top..detection.bottom).step_by(step_y) {
        for x in (detection.left..detection.right).step_by(step_x) {
            let index = (y * width + x) * 4;
            let red = (rgba[index] >> 4) as u16;
            let green = (rgba[index + 1] >> 4) as u16;
            let blue = (rgba[index + 2] >> 4) as u16;
            colors.insert((red << 8) | (green << 4) | blue);
        }
    }

    colors.len()
}

pub(crate) fn estimate_coherent_cell_count(
    rgba: &[u8],
    width: usize,
    detection: Detection,
) -> usize {
    let max_columns = detection.grid_width.min(10);
    let max_rows = detection.grid_height.min(10);
    let step_column = (detection.grid_width / max_columns.max(1)).max(1);
    let step_row = (detection.grid_height / max_rows.max(1)).max(1);
    let cell_width = (detection.right - detection.left) as f32 / detection.grid_width.max(1) as f32;
    let cell_height =
        (detection.bottom - detection.top) as f32 / detection.grid_height.max(1) as f32;
    let patch_width = ((cell_width * 0.18).round() as usize).max(1);
    let patch_height = ((cell_height * 0.18).round() as usize).max(1);
    let inset_x = ((cell_width * 0.16).round() as usize).max(1);
    let inset_y = ((cell_height * 0.16).round() as usize).max(1);
    let mut coherent = 0_usize;

    for row in (0..detection.grid_height).step_by(step_row) {
        for column in (0..detection.grid_width).step_by(step_column) {
            let cell_left = detection.left + (column as f32 * cell_width).round() as usize;
            let cell_top = detection.top + (row as f32 * cell_height).round() as usize;
            let cell_right = detection.left + ((column + 1) as f32 * cell_width).round() as usize;
            let cell_bottom = detection.top + ((row + 1) as f32 * cell_height).round() as usize;
            if cell_right <= cell_left + patch_width || cell_bottom <= cell_top + patch_height {
                continue;
            }

            let samples = [
                sample_patch_rgb(
                    rgba,
                    width,
                    cell_left + inset_x,
                    cell_top + inset_y,
                    patch_width,
                    patch_height,
                ),
                sample_patch_rgb(
                    rgba,
                    width,
                    cell_right.saturating_sub(inset_x + patch_width),
                    cell_top + inset_y,
                    patch_width,
                    patch_height,
                ),
                sample_patch_rgb(
                    rgba,
                    width,
                    cell_left + inset_x,
                    cell_bottom.saturating_sub(inset_y + patch_height),
                    patch_width,
                    patch_height,
                ),
                sample_patch_rgb(
                    rgba,
                    width,
                    cell_right.saturating_sub(inset_x + patch_width),
                    cell_bottom.saturating_sub(inset_y + patch_height),
                    patch_width,
                    patch_height,
                ),
            ];

            let mut total_distance = 0.0_f32;
            let mut pairs = 0_usize;
            for outer in 0..samples.len() {
                for inner in outer + 1..samples.len() {
                    total_distance += color_distance(samples[outer], samples[inner]);
                    pairs += 1;
                }
            }

            if pairs > 0 && total_distance / pairs as f32 <= 22.0 {
                coherent += 1;
            }
        }
    }

    coherent
}

pub(crate) fn estimate_grid_boundary_strength(
    luma: &[f32],
    width: usize,
    detection: Detection,
) -> f32 {
    let cell_width = (detection.right - detection.left) as f32 / detection.grid_width.max(1) as f32;
    let cell_height =
        (detection.bottom - detection.top) as f32 / detection.grid_height.max(1) as f32;
    let vertical = estimate_axis_boundary_strength(luma, width, detection, cell_width, true);
    let horizontal = estimate_axis_boundary_strength(luma, width, detection, cell_height, false);
    vertical.min(horizontal)
}

fn estimate_axis_boundary_strength(
    luma: &[f32],
    width: usize,
    detection: Detection,
    cell_size: f32,
    vertical_lines: bool,
) -> f32 {
    let mut boundary_total = 0.0_f32;
    let mut boundary_count = 0_usize;
    let mut interior_total = 0.0_f32;
    let mut interior_count = 0_usize;

    let steps = if vertical_lines {
        detection.grid_width
    } else {
        detection.grid_height
    };

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

        boundary_total += sample_axis_gradient(luma, width, detection, boundary, vertical_lines);
        interior_total += sample_axis_gradient(luma, width, detection, interior, vertical_lines);
        boundary_count += 1;
        interior_count += 1;
    }

    let boundary_mean = boundary_total / boundary_count.max(1) as f32;
    let interior_mean = interior_total / interior_count.max(1) as f32;
    boundary_mean / interior_mean.max(1e-3)
}

fn sample_axis_gradient(
    luma: &[f32],
    width: usize,
    detection: Detection,
    position: f32,
    vertical_lines: bool,
) -> f32 {
    if vertical_lines {
        let x = position.round() as usize;
        let clamped_x = x.clamp(detection.left + 1, detection.right.saturating_sub(2));
        let mut total = 0.0_f32;
        let mut count = 0_usize;
        for y in detection.top.saturating_add(1)..detection.bottom.saturating_sub(1) {
            let row = y * width;
            total += (luma[row + clamped_x + 1] - luma[row + clamped_x - 1]).abs();
            count += 1;
        }
        total / count.max(1) as f32
    } else {
        let y = position.round() as usize;
        let clamped_y = y.clamp(detection.top + 1, detection.bottom.saturating_sub(2));
        let row = clamped_y * width;
        let mut total = 0.0_f32;
        let mut count = 0_usize;
        for x in detection.left.saturating_add(1)..detection.right.saturating_sub(1) {
            total += (luma[row + x + width] - luma[row + x - width]).abs();
            count += 1;
        }
        total / count.max(1) as f32
    }
}

fn sample_patch_rgb(
    rgba: &[u8],
    width: usize,
    left: usize,
    top: usize,
    patch_width: usize,
    patch_height: usize,
) -> [f32; 3] {
    let mut sum = [0.0_f32; 3];
    let mut count = 0_usize;
    for y in top..top + patch_height {
        for x in left..left + patch_width {
            let index = (y * width + x) * 4;
            sum[0] += rgba[index] as f32;
            sum[1] += rgba[index + 1] as f32;
            sum[2] += rgba[index + 2] as f32;
            count += 1;
        }
    }

    let divisor = count.max(1) as f32;
    [sum[0] / divisor, sum[1] / divisor, sum[2] / divisor]
}

fn median_usize(values: &mut [usize]) -> usize {
    values.sort_unstable();
    values[values.len() / 2]
}

pub(crate) fn build_column_edge_projection(luma: &[f32], width: usize, height: usize) -> Vec<f32> {
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

pub(crate) fn build_row_edge_projection(luma: &[f32], width: usize, height: usize) -> Vec<f32> {
    let mut projection = vec![0.0; height];
    for (y, value) in projection
        .iter_mut()
        .enumerate()
        .take(height.saturating_sub(1))
        .skip(1)
    {
        let row = y * width;
        for x in 1..width.saturating_sub(1) {
            let gx = (luma[row + x + 1] - luma[row + x - 1]).abs();
            let gy = (luma[row + x + width] - luma[row + x - width]).abs();
            *value += gy + gx * 0.15;
        }
    }
    projection
}

pub(crate) fn smooth_projection(values: &mut [f32], radius: usize) {
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

pub(crate) fn normalize_projection(values: &mut [f32], divisor: f32) {
    if divisor <= 0.0 {
        return;
    }
    for value in values {
        *value /= divisor;
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

pub(crate) fn find_local_peaks(
    values: &[f32],
    max_peaks: usize,
    min_distance: usize,
) -> Vec<usize> {
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

pub(crate) fn build_light_separator_coverage_signal(
    rgba: &[u8],
    width: usize,
    height: usize,
    along_x: bool,
) -> Vec<f32> {
    let axis_length = if along_x { width } else { height };
    let other_length = if along_x { height } else { width };
    let mut signal = vec![0.0; axis_length];

    for (line, coverage) in signal.iter_mut().enumerate().take(axis_length) {
        let mut matches = 0_usize;
        for offset in 0..other_length {
            let x = if along_x { line } else { offset };
            let y = if along_x { offset } else { line };
            let index = (y * width + x) * 4;
            if is_light_separator_pixel([rgba[index], rgba[index + 1], rgba[index + 2]]) {
                matches += 1;
            }
        }
        *coverage = matches as f32 / other_length.max(1) as f32;
    }

    signal
}

pub(crate) fn build_content_coverage_signal(
    rgba: &[u8],
    width: usize,
    height: usize,
    along_x: bool,
) -> Vec<f32> {
    let axis_length = if along_x { width } else { height };
    let other_length = if along_x { height } else { width };
    let mut signal = vec![0.0; axis_length];

    for (line, coverage) in signal.iter_mut().enumerate().take(axis_length) {
        let mut matches = 0_usize;
        for offset in 0..other_length {
            let x = if along_x { line } else { offset };
            let y = if along_x { offset } else { line };
            let index = (y * width + x) * 4;
            if is_content_pixel([
                rgba[index],
                rgba[index + 1],
                rgba[index + 2],
                rgba[index + 3],
            ]) {
                matches += 1;
            }
        }
        *coverage = matches as f32 / other_length.max(1) as f32;
    }

    signal
}

pub(crate) fn build_light_separator_crop_signal(
    rgba: &[u8],
    width: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
    along_x: bool,
) -> Vec<f32> {
    let axis_length = if along_x {
        right.saturating_sub(left)
    } else {
        bottom.saturating_sub(top)
    };
    let other_length = if along_x {
        bottom.saturating_sub(top)
    } else {
        right.saturating_sub(left)
    };
    let mut signal = vec![0.0; axis_length.max(1)];

    for (line, coverage) in signal.iter_mut().enumerate().take(axis_length) {
        let mut matches = 0_usize;
        for offset in 0..other_length {
            let x = if along_x { left + line } else { left + offset };
            let y = if along_x { top + offset } else { top + line };
            let index = (y * width + x) * 4;
            if is_light_separator_pixel([rgba[index], rgba[index + 1], rgba[index + 2]]) {
                matches += 1;
            }
        }
        *coverage = matches as f32 / other_length.max(1) as f32;
    }

    smooth_projection(&mut signal, 2);
    signal
}

pub(crate) fn detect_separator_family_extent(signal: &[f32]) -> Option<LinePair> {
    if signal.len() < 12 {
        return None;
    }

    let mean = projection_mean(signal);
    let std = projection_std(signal, mean);
    let max_value = signal.iter().copied().fold(0.0_f32, f32::max);
    let threshold = (max_value * 0.12).max(mean + std * 0.45).max(0.008);

    let hits: Vec<usize> = signal
        .iter()
        .enumerate()
        .filter_map(|(index, value)| (*value >= threshold).then_some(index))
        .collect();
    if hits.len() < 18 {
        return None;
    }

    let start_index = ((hits.len() as f32) * 0.03).floor() as usize;
    let end_index = ((hits.len() as f32) * 0.97).ceil() as usize;
    let start = *hits.get(start_index).unwrap_or(&hits[0]);
    let end = *hits
        .get(end_index.min(hits.len().saturating_sub(1)))
        .unwrap_or(hits.last()?);
    if end.saturating_sub(start) < ((signal.len() as f32) * 0.35) as usize {
        return None;
    }

    let padding = 2;
    Some(LinePair {
        start: start.saturating_sub(padding),
        end: (end + padding + 1).min(signal.len()),
    })
}

pub(crate) fn detect_dense_signal_extent(
    signal: &[f32],
    minimum_threshold: f32,
    max_scale: f32,
    std_scale: f32,
    min_hits: usize,
    min_span_ratio: f32,
) -> Option<LinePair> {
    if signal.len() < 12 {
        return None;
    }

    let mean = projection_mean(signal);
    let std = projection_std(signal, mean);
    let max_value = signal.iter().copied().fold(0.0_f32, f32::max);
    let threshold = (max_value * max_scale)
        .max(mean + std * std_scale)
        .max(minimum_threshold);

    let hits: Vec<usize> = signal
        .iter()
        .enumerate()
        .filter_map(|(index, value)| (*value >= threshold).then_some(index))
        .collect();
    if hits.len() < min_hits {
        return None;
    }

    let mut best_start = hits[0];
    let mut best_end = hits[0];
    let mut current_start = hits[0];
    let mut current_end = hits[0];
    let mut best_count = 1_usize;
    let mut current_count = 1_usize;
    let max_gap = 12_usize;

    for value in hits.iter().skip(1).copied() {
        if value.saturating_sub(current_end) <= max_gap {
            current_end = value;
            current_count += 1;
            continue;
        }

        if current_count > best_count
            || (current_count == best_count
                && current_end.saturating_sub(current_start) > best_end.saturating_sub(best_start))
        {
            best_start = current_start;
            best_end = current_end;
            best_count = current_count;
        }
        current_start = value;
        current_end = value;
        current_count = 1;
    }

    if current_count > best_count
        || (current_count == best_count
            && current_end.saturating_sub(current_start) > best_end.saturating_sub(best_start))
    {
        best_start = current_start;
        best_end = current_end;
        best_count = current_count;
    }

    let span = best_end.saturating_sub(best_start);
    if best_count < min_hits || span < ((signal.len() as f32) * min_span_ratio) as usize {
        return None;
    }

    Some(LinePair {
        start: best_start.saturating_sub(2),
        end: (best_end + 3).min(signal.len()),
    })
}

pub(crate) fn choose_outer_pair(
    projection: &[f32],
    peaks: &[usize],
    full_span: usize,
) -> Option<LinePair> {
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

pub(crate) fn border_colors_are_consistent(
    rgba: &[u8],
    width: usize,
    height: usize,
    horizontal: LinePair,
    vertical: LinePair,
) -> bool {
    if horizontal.end <= horizontal.start + 8 || vertical.end <= vertical.start + 8 {
        return false;
    }

    let top = sample_horizontal_border_color(
        rgba,
        width,
        height,
        horizontal.start,
        horizontal.end,
        vertical.start,
    );
    let bottom = sample_horizontal_border_color(
        rgba,
        width,
        height,
        horizontal.start,
        horizontal.end,
        vertical.end,
    );
    let left = sample_vertical_border_color(
        rgba,
        width,
        height,
        horizontal.start,
        vertical.start,
        vertical.end,
    );
    let right = sample_vertical_border_color(
        rgba,
        width,
        height,
        horizontal.end,
        vertical.start,
        vertical.end,
    );

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
    sample_strip_color(
        rgba,
        width,
        height,
        inner_left,
        inner_right,
        inner_top,
        inner_bottom,
    )
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

pub(crate) fn is_light_separator_pixel(pixel: [u8; 3]) -> bool {
    let red = pixel[0] as f32;
    let green = pixel[1] as f32;
    let blue = pixel[2] as f32;
    let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    let chroma = red.max(green).max(blue) - red.min(green).min(blue);
    (168.0..=244.0).contains(&luminance) && chroma <= 24.0
}

pub(crate) fn has_boundary_separator_lines(signal: &[f32], period: usize) -> bool {
    if signal.len() < 24 || period < 3 {
        return false;
    }

    let mean = projection_mean(signal);
    let std = projection_std(signal, mean);
    let max_value = signal.iter().copied().fold(0.0_f32, f32::max);
    let threshold = (max_value * 0.22).max(mean + std * 0.18).max(0.01);
    let edge_span = ((period as f32) * 0.4).round() as usize;
    let left_end = edge_span.clamp(1, signal.len());
    let right_start = signal
        .len()
        .saturating_sub(edge_span.clamp(1, signal.len()));

    let left_peak = signal[..left_end].iter().copied().fold(0.0_f32, f32::max);
    let right_peak = signal[right_start..]
        .iter()
        .copied()
        .fold(0.0_f32, f32::max);
    left_peak >= threshold && right_peak >= threshold
}

pub(crate) fn should_add_boundary_cell(crop_span: usize, period: usize) -> bool {
    crop_span >= 3000 || period >= 96
}

pub(crate) fn estimate_edge_period_for_crop(
    luma: &[f32],
    width: usize,
    left: usize,
    right: usize,
    top: usize,
    bottom: usize,
    vertical_lines: bool,
) -> Option<usize> {
    let signal = if vertical_lines {
        build_crop_column_projection(luma, width, left, right, top, bottom)
    } else {
        build_crop_row_projection(luma, width, left, right, top, bottom)
    };
    estimate_period_from_fft(&signal)
}

pub(crate) fn dominant_period_for_crop(
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

pub(crate) fn build_crop_column_projection(
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

pub(crate) fn build_crop_row_projection(
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
