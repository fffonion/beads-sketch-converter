mod detector;
mod detector_signal;
mod edge_enhance;
mod fft;
mod types;

use std::slice;

use detector::{detect_auto_inner, detect_chart_inner, detect_pixel_art_inner};
use edge_enhance::enhance_edges_fft_in_place;
use types::Detection;

static mut RESULT: [i32; 16] = [0; 16];

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
pub extern "C" fn detect_auto(ptr: *const u8, len: usize, width: u32, height: u32) -> u32 {
    let width = width as usize;
    let height = height as usize;
    let expected_len = width.saturating_mul(height).saturating_mul(4);
    if ptr.is_null() || len < expected_len || width < 48 || height < 48 {
        write_auto_result(None, None);
        return 0;
    }

    let rgba = unsafe { slice::from_raw_parts(ptr, expected_len) };
    let (chart, pixel) = detect_auto_inner(rgba, width, height);
    write_auto_result(chart, pixel);
    if chart.is_some() || pixel.is_some() { 1 } else { 0 }
}

#[unsafe(no_mangle)]
pub extern "C" fn detect_chart(ptr: *const u8, len: usize, width: u32, height: u32) -> u32 {
    let width = width as usize;
    let height = height as usize;
    let expected_len = width.saturating_mul(height).saturating_mul(4);
    if ptr.is_null() || len < expected_len || width < 96 || height < 96 {
        write_single_result(None);
        return 0;
    }

    let rgba = unsafe { slice::from_raw_parts(ptr, expected_len) };
    let detection = detect_chart_inner(rgba, width, height);
    write_single_result(detection);
    unsafe { RESULT[0] as u32 }
}

#[unsafe(no_mangle)]
pub extern "C" fn detect_pixel_art(ptr: *const u8, len: usize, width: u32, height: u32) -> u32 {
    let width = width as usize;
    let height = height as usize;
    let expected_len = width.saturating_mul(height).saturating_mul(4);
    if ptr.is_null() || len < expected_len || width < 48 || height < 48 {
        write_single_result(None);
        return 0;
    }

    let rgba = unsafe { slice::from_raw_parts(ptr, expected_len) };
    let detection = detect_pixel_art_inner(rgba, width, height);
    write_single_result(detection);
    unsafe { RESULT[0] as u32 }
}

#[unsafe(no_mangle)]
pub extern "C" fn enhance_edges(ptr: *mut u8, len: usize, width: u32, height: u32, strength_milli: u32) -> u32 {
    let width = width as usize;
    let height = height as usize;
    let expected_len = width.saturating_mul(height).saturating_mul(4);
    if ptr.is_null() || len < expected_len || width < 3 || height < 3 || strength_milli == 0 {
        return 0;
    }

    let rgba = unsafe { slice::from_raw_parts_mut(ptr, expected_len) };
    u32::from(enhance_edges_fft_in_place(
        rgba,
        width,
        height,
        strength_milli as f32 / 1000.0,
    ))
}

fn write_single_result(result: Option<Detection>) {
    unsafe {
        if let Some(detection) = result {
            RESULT[0] = 1;
            RESULT[1] = detection.left as i32;
            RESULT[2] = detection.top as i32;
            RESULT[3] = detection.right as i32;
            RESULT[4] = detection.bottom as i32;
            RESULT[5] = detection.grid_width as i32;
            RESULT[6] = detection.grid_height as i32;
            RESULT[7] = (detection.confidence * 1000.0).round() as i32;
            RESULT[8..].fill(0);
        } else {
            RESULT = [0; 16];
        }
    }
}

fn write_auto_result(chart: Option<Detection>, pixel: Option<Detection>) {
    unsafe {
        RESULT = [0; 16];
        write_result_at(0, chart);
        write_result_at(8, pixel);
    }
}

fn write_result_at(offset: usize, result: Option<Detection>) {
    unsafe {
        if let Some(detection) = result {
            RESULT[offset] = 1;
            RESULT[offset + 1] = detection.left as i32;
            RESULT[offset + 2] = detection.top as i32;
            RESULT[offset + 3] = detection.right as i32;
            RESULT[offset + 4] = detection.bottom as i32;
            RESULT[offset + 5] = detection.grid_width as i32;
            RESULT[offset + 6] = detection.grid_height as i32;
            RESULT[offset + 7] = (detection.confidence * 1000.0).round() as i32;
        }
    }
}
