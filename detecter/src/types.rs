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
