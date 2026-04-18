#[derive(Clone, Copy)]
pub(crate) struct Detection {
    pub(crate) left: usize,
    pub(crate) top: usize,
    pub(crate) right: usize,
    pub(crate) bottom: usize,
    pub(crate) grid_width: usize,
    pub(crate) grid_height: usize,
    pub(crate) confidence: f32,
}

impl Detection {
    pub(crate) fn crop_width(self) -> usize {
        self.right.saturating_sub(self.left)
    }

    pub(crate) fn crop_height(self) -> usize {
        self.bottom.saturating_sub(self.top)
    }

    pub(crate) fn cell_width(self) -> f32 {
        self.crop_width() as f32 / self.grid_width.max(1) as f32
    }

    pub(crate) fn cell_height(self) -> f32 {
        self.crop_height() as f32 / self.grid_height.max(1) as f32
    }
}

#[derive(Clone, Copy)]
pub(crate) struct RectBox {
    pub(crate) left: usize,
    pub(crate) top: usize,
    pub(crate) right: usize,
    pub(crate) bottom: usize,
}

#[derive(Clone, Copy)]
pub(crate) struct LinePair {
    pub(crate) start: usize,
    pub(crate) end: usize,
}
