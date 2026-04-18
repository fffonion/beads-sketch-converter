use crate::types::Detection;

pub(crate) fn choose_best_detection(
    candidates: impl IntoIterator<Item = Detection>,
    score: impl Fn(Detection) -> f32,
) -> Option<Detection> {
    candidates.into_iter().max_by(|left, right| {
        let left_score = score(*left);
        let right_score = score(*right);
        left_score.total_cmp(&right_score)
    })
}

pub(crate) fn aspect_ratio_ratio(
    crop_width: usize,
    crop_height: usize,
    grid_width: usize,
    grid_height: usize,
) -> f32 {
    let crop_aspect = crop_width as f32 / crop_height.max(1) as f32;
    let grid_aspect = grid_width as f32 / grid_height.max(1) as f32;
    if crop_aspect > grid_aspect {
        crop_aspect / grid_aspect.max(0.0001)
    } else {
        grid_aspect / crop_aspect.max(0.0001)
    }
}

pub(crate) fn matches_grid_aspect(
    crop_width: usize,
    crop_height: usize,
    grid_width: usize,
    grid_height: usize,
    tolerance: f32,
) -> bool {
    aspect_ratio_ratio(crop_width, crop_height, grid_width, grid_height) <= tolerance
}

pub(crate) fn rounded_grid_size(
    crop_width: usize,
    crop_height: usize,
    x_period: usize,
    y_period: usize,
) -> (usize, usize) {
    (
        ((crop_width as f32) / (x_period as f32)).round() as usize,
        ((crop_height as f32) / (y_period as f32)).round() as usize,
    )
}

pub(crate) fn grid_size_in_range(
    grid_width: usize,
    grid_height: usize,
    min: usize,
    max: usize,
) -> bool {
    (min..=max).contains(&grid_width) && (min..=max).contains(&grid_height)
}

pub(crate) fn make_detection(
    left: usize,
    top: usize,
    right: usize,
    bottom: usize,
    grid_width: usize,
    grid_height: usize,
    confidence: f32,
) -> Detection {
    Detection {
        left,
        top,
        right,
        bottom,
        grid_width,
        grid_height,
        confidence,
    }
}

pub(crate) fn boost_confidence(detection: Detection, delta: f32) -> Detection {
    Detection {
        confidence: (detection.confidence + delta).min(0.99),
        ..detection
    }
}

pub(crate) fn detection_outer_margin_ratio(
    width: usize,
    height: usize,
    detection: Detection,
) -> f32 {
    let horizontal =
        (detection.left + width.saturating_sub(detection.right)) as f32 / width.max(1) as f32;
    let vertical =
        (detection.top + height.saturating_sub(detection.bottom)) as f32 / height.max(1) as f32;
    (horizontal + vertical) * 0.5
}

#[cfg(test)]
mod tests {
    use super::{
        aspect_ratio_ratio, choose_best_detection, grid_size_in_range, make_detection,
        matches_grid_aspect, rounded_grid_size,
    };

    #[test]
    fn aspect_ratio_matching_uses_shared_tolerance_logic() {
        assert!(matches_grid_aspect(300, 200, 3, 2, 1.01));
        assert!(!matches_grid_aspect(300, 200, 2, 2, 1.01));
        assert!(aspect_ratio_ratio(300, 200, 2, 2) > 1.01);
    }

    #[test]
    fn rounded_grid_size_reuses_period_rounding() {
        assert_eq!(rounded_grid_size(603, 398, 20, 20), (30, 20));
        assert!(grid_size_in_range(30, 20, 10, 102));
        assert!(!grid_size_in_range(30, 2, 10, 102));
    }

    #[test]
    fn choose_best_detection_selects_highest_scored_candidate() {
        let low = make_detection(0, 0, 20, 20, 10, 10, 0.4);
        let high = make_detection(0, 0, 30, 30, 10, 10, 0.8);

        let chosen = choose_best_detection([low, high], |detection| detection.confidence)
            .expect("a detection should be chosen");

        assert_eq!(chosen.right, 30);
        assert_eq!(chosen.confidence, 0.8);
    }
}
