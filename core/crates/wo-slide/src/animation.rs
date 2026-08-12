//! Animation timeline runtime for presentation slides.
//!
//! This module provides the runtime for scheduling, sequencing, and driving
//! slide animations. It models the animation timeline of a single slide:
//! entrance, emphasis, exit, and motion effects with triggers like
//! "on click", "with previous", and "after previous".
//!
//! # Architecture
//!
//! [`TimelineBuilder`] resolves a list of [`AnimationData`] into an ordered
//! timeline of [`TimelineEntry`] items with concrete start/end times based on
//! trigger semantics. [`AnimationPlayer`] drives that timeline — play, pause,
//! stop, seek, step — and reports which animations are active, pending, or
//! completed at any point in time.
//!
//! # Usage
//!
//! ```ignore
//! use wo_slide::animation::{AnimationPlayer, TimelineBuilder};
//! use wo_slide::model::AnimationData;
//!
//! let anims = vec![AnimationData { id: "a1".into(), effect: "fade".into(), ... }];
//! let entries = TimelineBuilder::build(&anims);
//! let mut player = AnimationPlayer::new(entries);
//! player.play();
//! player.advance(0.5);
//! for active in player.active_animations() {
//!     println!("{} at {:.0}%", active.id, active.progress * 100.0);
//! }
//! ```

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Animation trigger types
// ---------------------------------------------------------------------------

/// When an animation starts relative to other animations.
///
/// Corresponds to the `start` attribute in PPTX animation elements.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnimationTrigger {
    /// Starts on mouse click / tap.
    OnClick,
    /// Starts at the same time as the previous animation.
    WithPrevious,
    /// Starts after the previous animation finishes.
    AfterPrevious,
}

impl Default for AnimationTrigger {
    fn default() -> Self {
        AnimationTrigger::OnClick
    }
}

impl AnimationTrigger {
    /// Parse from the string values used in PPTX (start attribute).
    pub fn from_str(s: &str) -> Self {
        match s {
            "click" | "onClick" => AnimationTrigger::OnClick,
            "withPrevious" | "with" => AnimationTrigger::WithPrevious,
            "afterPrevious" | "after" => AnimationTrigger::AfterPrevious,
            _ => AnimationTrigger::OnClick,
        }
    }
}

/// Category of animation effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnimationCategory {
    /// Object enters the slide (fade in, fly in, etc.).
    Entrance,
    /// Object emphasis (pulse, spin, etc.).
    Emphasis,
    /// Object exits the slide (fade out, fly out, etc.).
    Exit,
    /// Motion path animation.
    Motion,
    /// Media playback (audio/video).
    Media,
}

impl AnimationCategory {
    /// Parse from the string values used in AnimationData.category.
    pub fn from_str(s: &str) -> Self {
        match s {
            "entrance" => AnimationCategory::Entrance,
            "emphasis" => AnimationCategory::Emphasis,
            "exit" => AnimationCategory::Exit,
            "motion" => AnimationCategory::Motion,
            "media" => AnimationCategory::Media,
            _ => AnimationCategory::Entrance,
        }
    }
}

/// How text within a shape is animated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TextAnimationScope {
    /// All text appears at once.
    AllAtOnce,
    /// Text appears word by word.
    ByWord,
    /// Text appears letter by letter.
    ByLetter,
}

impl Default for TextAnimationScope {
    fn default() -> Self {
        TextAnimationScope::AllAtOnce
    }
}

// ---------------------------------------------------------------------------
// Timeline entry — a single resolved animation event
// ---------------------------------------------------------------------------

/// A single resolved animation event in the timeline.
///
/// This struct resolves the symbolic [`AnimationData`] into concrete timing:
/// start time, end time, and ordering relative to other events are fully
/// computed based on trigger, duration, and delay.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimelineEntry {
    /// Unique animation ID (copied from AnimationData.id).
    pub id: String,
    /// The ID of the target shape.
    pub target: String,
    /// Effect name (e.g. "fade", "flyIn", "pulse").
    pub effect: String,
    /// Category of the animation.
    pub category: AnimationCategory,
    /// Start trigger.
    pub trigger: AnimationTrigger,
    /// Absolute start time in seconds (computed from timeline ordering).
    pub start_time: f64,
    /// Duration in seconds.
    pub duration: f64,
    /// Additional delay in seconds (after trigger condition).
    pub delay: f64,
    /// End time in seconds (= start_time + duration).
    pub end_time: f64,
    /// Animation progress within the timed segment (0.0–1.0).
    pub progress: f64,
    /// How text within the shape is animated.
    #[serde(default)]
    pub text_scope: TextAnimationScope,
}

impl TimelineEntry {
    /// Create a new timeline entry from [`AnimationData`] with a given
    /// trigger and start time.
    pub fn from_animation_data(
        data: &crate::model::AnimationData,
        trigger: AnimationTrigger,
        start_time: f64,
    ) -> Self {
        let duration = data.duration.max(0.1); // Minimum 100 ms
        Self {
            id: data.id.clone(),
            target: data.target.clone(),
            effect: data.effect.clone(),
            category: AnimationCategory::from_str(&data.category),
            trigger,
            start_time,
            duration,
            delay: data.delay,
            end_time: start_time + duration,
            progress: 0.0,
            text_scope: TextAnimationScope::AllAtOnce,
        }
    }

    /// Check if the animation is active at a given time.
    ///
    /// An animation is active when `start_time <= time < end_time`.
    #[inline]
    pub fn is_active_at(&self, time: f64) -> bool {
        time >= self.start_time && time < self.end_time
    }

    /// Check if the animation has started by a given time.
    #[inline]
    pub fn has_started(&self, time: f64) -> bool {
        time >= self.start_time
    }

    /// Check if the animation has finished by a given time.
    #[inline]
    pub fn has_finished(&self, time: f64) -> bool {
        time >= self.end_time
    }

    /// Compute the current progress (0.0–1.0) of this entry at the given
    /// time. Returns 0.0 if the animation hasn't started yet, 1.0 if
    /// finished.
    pub fn compute_progress(&self, time: f64) -> f64 {
        if time <= self.start_time {
            0.0
        } else if time >= self.end_time {
            1.0
        } else {
            (time - self.start_time) / self.duration
        }
    }
}

// ---------------------------------------------------------------------------
// Animation phase for state queries
// ---------------------------------------------------------------------------

/// The phase that an animation is in during playback.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnimationPhase {
    /// Animation is pending — hasn't started yet.
    Pending,
    /// Animation is currently active — between start and end.
    Active,
    /// Animation has completed.
    Completed,
}

// ---------------------------------------------------------------------------
// Timeline builder
// ---------------------------------------------------------------------------

/// Builds an ordered timeline from slide animation data.
///
/// Handles the sequencing of animations based on their trigger types:
///
/// | Trigger | Behaviour |
/// |---------|-----------|
/// | `OnClick` | Starts after a preceding click step. Each OnClick animation begins a new step group. |
/// | `WithPrevious` | Starts at the same time as the preceding animation. |
/// | `AfterPrevious` | Starts as soon as the preceding animation finishes. |
///
/// Within a step group, `WithPrevious` and `AfterPrevious` animations are
/// relative to the preceding entry rather than the click event itself.
pub struct TimelineBuilder;

impl TimelineBuilder {
    /// Build a sorted timeline from a list of animation data items.
    ///
    /// The returned entries are ordered by their computed start time.
    /// If no valid animations are provided, returns an empty `Vec`.
    pub fn build(animations: &[crate::model::AnimationData]) -> Vec<TimelineEntry> {
        if animations.is_empty() {
            return Vec::new();
        }

        let mut entries: Vec<TimelineEntry> = Vec::with_capacity(animations.len());
        // Tracks the end of the last *completed* animation (for AfterPrevious).
        let mut last_end_time = 0.0;
        // Tracks the accumulated time for the current click-group block.
        let mut click_group_time = 0.0;

        for anim in animations {
            let trigger = AnimationTrigger::from_str(&anim.start);

            let start_time = match trigger {
                AnimationTrigger::OnClick => {
                    // Each OnClick animation starts a new block.  The delay
                    // is added to the current click-group accumulated time.
                    let time = click_group_time + anim.delay;
                    click_group_time = time + anim.duration.max(0.1);
                    time
                }
                AnimationTrigger::AfterPrevious => {
                    // AfterPrevious starts after the preceding entry finishes.
                    let time = last_end_time + anim.delay;
                    let this_end = time + anim.duration.max(0.1);
                    if this_end > last_end_time {
                        last_end_time = this_end;
                    }
                    time
                }
                AnimationTrigger::WithPrevious => {
                    // WithPrevious runs in parallel with the preceding entry.
                    // If there is no preceding entry, fall back to click-group time.
                    let preceding_end = entries.last().map(|e| e.start_time).unwrap_or(click_group_time);
                    let time = preceding_end + anim.delay;
                    let this_end = time + anim.duration.max(0.1);
                    if this_end > last_end_time {
                        last_end_time = this_end;
                    }
                    // Also advance click_group_time so this entry doesn't
                    // fall behind the parallel group total.
                    if this_end > click_group_time {
                        click_group_time = this_end;
                    }
                    time
                }
            };

            let entry = TimelineEntry::from_animation_data(anim, trigger, start_time);
            entries.push(entry);
        }

        // Sort by start_time for deterministic order.
        entries.sort_by(|a, b| {
            a.start_time
                .partial_cmp(&b.start_time)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        entries
    }
}

// ---------------------------------------------------------------------------
// Playback state machine
// ---------------------------------------------------------------------------

/// Playback state of the animation timeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlaybackState {
    /// No animations loaded, or timeline is idle at the beginning.
    Idle,
    /// Animations are actively playing (time is advancing).
    Playing,
    /// Timeline is paused at the current position.
    Paused,
    /// All animations have completed.
    Finished,
}

/// Drives the animation timeline, tracking current time and state.
///
/// The player manages:
///
/// - The timeline entries (built from slide animation data via [`TimelineBuilder`])
/// - Current playback time
/// - Playback state (idle / playing / paused / finished)
/// - Step-wise advancement for click-triggered animations
/// - Per-animation progress queries
///
/// # State machine
///
/// ```text
///              play()
///   Idle ───────────────→ Playing
///                         ↑  ↓  pause()
///                         │  ←──────── Paused
///                         │               ↓ resume()
///                         │  ←────────────
///                         ↓ advance() to end
///                       Finished
///                         ↑
///                    stop() from any state
///                         ↓
///                       Idle
/// ```
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationPlayer {
    /// The ordered timeline entries to play.
    timeline: Vec<TimelineEntry>,
    /// Current playback time in seconds.
    current_time: f64,
    /// Total duration of all animations in seconds.
    total_duration: f64,
    /// Current playback state.
    state: PlaybackState,
    /// Current click step index (-1 = before any click).
    click_step: i32,
}

impl AnimationPlayer {
    /// Create a new player with the given timeline entries.
    ///
    /// The player starts in the [`Idle`](PlaybackState::Idle) state at time 0.
    pub fn new(timeline: Vec<TimelineEntry>) -> Self {
        let total_duration = timeline
            .iter()
            .map(|e| e.end_time)
            .fold(0.0, f64::max);

        Self {
            timeline,
            current_time: 0.0,
            total_duration,
            state: PlaybackState::Idle,
            click_step: -1,
        }
    }

    /// Create an empty player with no animations.
    ///
    /// Calling [`play()`](Self::play) on an empty player immediately
    /// transitions to [`Finished`](PlaybackState::Finished).
    pub fn empty() -> Self {
        Self {
            timeline: Vec::new(),
            current_time: 0.0,
            total_duration: 0.0,
            state: PlaybackState::Idle,
            click_step: -1,
        }
    }

    /// Build a player directly from slide animation data.
    ///
    /// This is a convenience constructor that calls [`TimelineBuilder::build`]
    /// internally.
    pub fn from_animations(animations: &[crate::model::AnimationData]) -> Self {
        let timeline = TimelineBuilder::build(animations);
        Self::new(timeline)
    }

    // ── Control ──────────────────────────────────────────────────────────

    /// Start or resume playback from the current position.
    //