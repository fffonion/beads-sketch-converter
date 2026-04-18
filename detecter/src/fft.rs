#[derive(Clone, Copy, Default)]
struct Complex {
    re: f32,
    im: f32,
}

pub(crate) fn estimate_period_from_fft(signal: &[f32]) -> Option<usize> {
    if signal.len() < 24 {
        return None;
    }

    let mean = signal.iter().sum::<f32>() / signal.len().max(1) as f32;
    let mut centered = Vec::<f32>::with_capacity(signal.len());
    for value in signal {
        centered.push(*value - mean);
    }
    if centered.iter().all(|value| value.abs() < 1e-3) {
        return None;
    }

    let fft_len = signal.len().next_power_of_two().max(32);
    let mut buffer = vec![Complex::default(); fft_len];
    let signal_len = signal.len() as f32;
    for (index, value) in centered.iter().enumerate() {
        let hann = if signal.len() <= 1 {
            1.0
        } else {
            let phase = index as f32 / (signal.len() - 1) as f32;
            0.5 - 0.5 * (std::f32::consts::TAU * phase).cos()
        };
        buffer[index].re = *value * hann;
    }
    fft_in_place(&mut buffer, false);

    let min_period = 3.0_f32;
    let max_period = (signal.len() as f32 / 10.0).clamp(16.0, 256.0);
    let mut candidates = Vec::<(f32, f32)>::new();
    let mut best_score = 0.0_f32;
    for bin in 1..(fft_len / 2) {
        let period = fft_len as f32 / bin as f32;
        if period < min_period || period > max_period {
            continue;
        }

        let cell_count = (signal_len / period).round() as usize;
        if !(10..=102).contains(&cell_count) {
            continue;
        }

        let mut score = complex_power(buffer[bin]);
        let mut harmonic = 2;
        while bin * harmonic < fft_len / 2 && harmonic <= 5 {
            score += complex_power(buffer[bin * harmonic]) / harmonic as f32;
            harmonic += 1;
        }
        score *= 1.0 + (period / signal_len).min(0.5) * 0.45;

        if score > best_score {
            best_score = score;
        }
        candidates.push((period, score));
    }

    if candidates.is_empty() || best_score <= 0.0 {
        None
    } else {
        let threshold = best_score * 0.84;
        let chosen = candidates
            .into_iter()
            .filter(|(_, score)| *score >= threshold)
            .max_by(|left, right| left.0.total_cmp(&right.0))
            .map(|(period, _)| period)
            .unwrap_or(0.0);
        (chosen > 0.0).then_some(chosen.round() as usize)
    }
}

fn complex_power(value: Complex) -> f32 {
    value.re * value.re + value.im * value.im
}

fn fft_in_place(values: &mut [Complex], invert: bool) {
    let length = values.len();
    if length <= 1 {
        return;
    }

    let mut bit_reversed = 0_usize;
    for index in 1..length {
        let mut bit = length >> 1;
        while bit_reversed & bit != 0 {
            bit_reversed ^= bit;
            bit >>= 1;
        }
        bit_reversed ^= bit;
        if index < bit_reversed {
            values.swap(index, bit_reversed);
        }
    }

    let mut len = 2_usize;
    while len <= length {
        let angle = (std::f32::consts::TAU / len as f32) * if invert { -1.0 } else { 1.0 };
        let wlen = Complex {
            re: angle.cos(),
            im: angle.sin(),
        };
        let half = len / 2;
        let mut start = 0_usize;
        while start < length {
            let mut w = Complex { re: 1.0, im: 0.0 };
            for offset in 0..half {
                let u = values[start + offset];
                let v = complex_mul(values[start + offset + half], w);
                values[start + offset] = complex_add(u, v);
                values[start + offset + half] = complex_sub(u, v);
                w = complex_mul(w, wlen);
            }
            start += len;
        }
        len <<= 1;
    }

    if invert {
        let scale = 1.0 / length as f32;
        for value in values {
            value.re *= scale;
            value.im *= scale;
        }
    }
}

fn complex_add(left: Complex, right: Complex) -> Complex {
    Complex {
        re: left.re + right.re,
        im: left.im + right.im,
    }
}

fn complex_sub(left: Complex, right: Complex) -> Complex {
    Complex {
        re: left.re - right.re,
        im: left.im - right.im,
    }
}

fn complex_mul(left: Complex, right: Complex) -> Complex {
    Complex {
        re: left.re * right.re - left.im * right.im,
        im: left.re * right.im + left.im * right.re,
    }
}
