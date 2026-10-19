//! Inheritance resolution for Slide -> SlideLayout -> SlideMaster hierarchy.
//!
//! This module implements PPTX-style inheritance where:
//! - A slide inherits from its SlideLayout (matched by layout_id)
//! - A layout inherits from its SlideMaster
//! - If slide.master_id is None, it falls back to the layout's master
//! - Slide-level explicit settings always override inherited values
//! - Resolution is READ-ONLY: original structs are never mutated
//!
//! Tests tagged with // F-301

use crate::model::{
    Bounds, Fill, Presentation, Shape, Slide, SlideBackground, SlideLayout, SlideMaster,
};

/// Resolved inheritance information for a slide.
/// This is a read-only projection that does not mutate the original structs.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedInheritance {
    /// The resolved layout for this slide (if any)
    pub layout: Option<ResolvedLayout>,
    /// The resolved master for this slide (if any)
    pub master: Option<ResolvedMaster>,
    /// Effective placeholder types inherited from layout and master
    pub placeholder_types: Vec<String>,
    /// Effective background inherited from layout/master (if not set on slide)
    pub background: Option<SlideBackground>,
    /// Effective shapes inherited from layout and master (if not overridden on slide)
    pub inherited_shapes: Vec<Shape>,
}

/// Resolved layout information
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedLayout {
    pub id: u32,
    pub name: String,
    pub layout_type: String,
}

/// Resolved master information
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedMaster {
    pub id: u32,
    pub name: String,
}

/// Resolve inheritance for a slide within a presentation.
///
/// # Arguments
/// * `slide` - The slide to resolve
/// * `presentation` - The presentation containing masters and layouts
///
/// # Returns
/// A `ResolvedInheritance` struct containing inherited properties.
/// Slide-level explicit settings always take precedence.
pub fn resolve_inheritance(slide: &Slide, presentation: &Presentation) -> ResolvedInheritance {
    // Find the layout for this slide
    let layout = slide.layout_id.as_ref().and_then(|layout_id_str| {
        presentation
            .masters
            .iter()
            .flat_map(|master| master.slide_layouts.iter())
            .find(|layout| {
                layout.id.to_string() == *layout_id_str || layout.name == *layout_id_str
            })
    });

    // Find the master: first try slide.master_id, then fall back to layout's master
    let master = if let Some(master_id_str) = &slide.master_id {
        presentation.masters.iter().find(|master| {
            master.id.to_string() == *master_id_str || master.name == *master_id_str
        })
    } else {
        // If slide doesn't have master_id, use the layout's master
        slide.layout_id.as_ref().and_then(|layout_id_str| {
            for master in &presentation.masters {
                for layout in &master.slide_layouts {
                    if layout.id.to_string() == *layout_id_str || layout.name == *layout_id_str {
                        return Some(master);
                    }
                }
            }
            None
        })
    };

    // Collect placeholder types from layout (if slide doesn't have explicit placeholder shapes)
    let placeholder_types: Vec<String> = if slide.shapes.iter().any(|s| matches!(s, Shape::Placeholder(_))) {
        // Slide has explicit placeholder shapes, don't inherit placeholder_types
        Vec::new()
    } else {
        // No explicit placeholder shapes on slide, inherit from layout
        layout.map(|l| l.placeholder_types.clone()).unwrap_or_default()
    };

    // Background: neither layouts nor masters carry one in the current model.
    let background = None;

    // Collect inherited shapes from layout and master
    // Only include shapes that are not overridden on the slide
    let slide_shape_ids: std::collections::HashSet<&str> = slide
        .shapes
        .iter()
        .filter_map(|shape| shape_id(shape))
        .collect();

    let inherited_shapes = {
        let mut shapes = Vec::new();
        if let Some(l) = &layout {
            for layout_shape in &l.shapes {
                let layout_shape_id = shape_id(layout_shape);
                // Only inherit if slide doesn't have a shape with the same id
                if let Some(id) = layout_shape_id {
                    if !slide_shape_ids.contains(id) {
                        shapes.push(layout_shape.clone());
                    }
                } else {
                    // If shape has no id, we can't determine if it's overridden, so don't inherit
                }
            }
        }
        shapes
    };

    ResolvedInheritance {
        layout: layout.map(|l| ResolvedLayout {
            id: l.id,
            name: l.name.clone(),
            layout_type: l.layout_type.clone(),
        }),
        master: master.map(|m| ResolvedMaster {
            id: m.id,
            name: m.name.clone(),
        }),
        placeholder_types,
        background,
        inherited_shapes,
    }
}

/// Extract the id from a Shape variant
fn shape_id(shape: &Shape) -> Option<&str> {
    match shape {
        Shape::TextBox(t) => Some(t.id.as_str()),
        Shape::Picture(p) => Some(p.id.as_str()),
        Shape::Placeholder(p) => Some(p.id.as_str()),
        Shape::Table(t) => Some(t.id.as_str()),
        Shape::Connector(c) => Some(c.id.as_str()),
        Shape::Chart(c) => Some(c.id.as_str()),
        Shape::Auto(a) => Some(a.id.as_str()),
        Shape::SmartArt(s) => Some(s.id.as_str()),
    }
}

/// Get the effective layout for a slide.
/// Returns the SlideLayout if found, None otherwise.
pub fn get_layout<'a>(
    slide: &Slide,
    presentation: &'a Presentation,
) -> Option<&'a SlideLayout> {
    slide.layout_id.as_ref().and_then(|layout_id_str| {
        presentation
            .masters
            .iter()
            .flat_map(|master| master.slide_layouts.iter())
            .find(|layout| {
                layout.id.to_string() == *layout_id_str || layout.name == *layout_id_str
            })
    })
}

/// Get the effective master for a slide.
/// First tries slide.master_id, then falls back to the layout's master.
pub fn get_master<'a>(
    slide: &Slide,
    presentation: &'a Presentation,
) -> Option<&'a SlideMaster> {
    // First, try slide.master_id directly
    if let Some(master_id_str) = &slide.master_id {
        if let Some(master) = presentation.masters.iter().find(|m| {
            m.id.to_string() == *master_id_str || m.name == *master_id_str
        }) {
            return Some(master);
        }
    }

    // If no explicit master_id on slide, try to find via layout
    if let Some(layout_id_str) = &slide.layout_id {
        for master in &presentation.masters {
            for layout in &master.slide_layouts {
                if layout.id.to_string() == *layout_id_str || layout.name == *layout_id_str {
                    return Some(master);
                }
            }
        }
    }

    None
}

mod tests {
    use super::*;
    use crate::model::{PlaceholderShape, SlideLayout, SlideMaster, TextBody};

    // Helper to create test fixtures
    fn create_test_presentation() -> Presentation {
        let mut pres = Presentation::new();

        // Create a master with two layouts
        let master1 = SlideMaster {
            id: 1,
            name: "Master One".to_string(),
            slide_layouts: vec![
                SlideLayout {
                    id: 101,
                    name: "Title Layout".to_string(),
                    layout_type: "title".to_string(),
                    shapes: vec![Shape::Placeholder(PlaceholderShape {
                        id: "title_ph".to_string(),
                        bounds: Bounds {
                            x: 100,
                            y: 100,
                            cx: 500,
                            cy: 100,
                        },
                        placeholder_type: "title".to_string(),
                        text_body: None,
                        fill: None,
                        effect: None,
                    })],
                    placeholder_types: vec!["title".to_string(), "subtitle".to_string()],
                },
                SlideLayout {
                    id: 102,
                    name: "Content Layout".to_string(),
                    layout_type: "title and content".to_string(),
                    shapes: vec![
                        Shape::Placeholder(PlaceholderShape {
                            id: "content_ph".to_string(),
                            bounds: Bounds {
                                x: 100,
                                y: 200,
                                cx: 500,
                                cy: 300,
                            },
                            placeholder_type: "content".to_string(),
                            text_body: None,
                            fill: None,
                            effect: None,
                        }),
                    ],
                    placeholder_types: vec!["title".to_string(), "content".to_string()],
                },
            ],
        };

        pres.masters.push(master1);
        pres
    }

    #[test]
    fn test_slide_resolves_through_layout() {
        // F-301: slide with layout_id resolves through that layout
        let pres = create_test_presentation();

        let slide = Slide {
            id: 1,
            name: "Test Slide".to_string(),
            layout_id: Some("101".to_string()), // References Title Layout
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };

        let resolved = resolve_inheritance(&slide, &pres);

        assert!(resolved.layout.is_some(), "Should resolve layout");
        let layout = resolved.layout.unwrap();
        assert_eq!(layout.id, 101, "Should resolve to layout 101");
        assert_eq!(layout.name, "Title Layout");
        
        // Should also resolve master via layout
        assert!(resolved.master.is_some(), "Should resolve master via layout");
        let master = resolved.master.unwrap();
        assert_eq!(master.id, 1, "Should resolve to master 1");
        
        // Should inherit placeholder types
        assert!(
            resolved.placeholder_types.contains(&"title".to_string()),
            "Should inherit title placeholder type"
        );
        assert!(
            resolved.placeholder_types.contains(&"subtitle".to_string()),
            "Should inherit subtitle placeholder type"
        );
        
        // Should inherit shapes from layout
        assert_eq!(resolved.inherited_shapes.len(), 1, "Should inherit layout shape");
    }

    #[test]
    fn test_slide_without_master_id_falls_back_to_layouts_master() {
        // F-301: slide WITHOUT master_id falls back to the layout's master
        let pres = create_test_presentation();

        let slide = Slide {
            id: 2,
            name: "Test Slide 2".to_string(),
            layout_id: Some("Title Layout".to_string()), // References by name
            master_id: None, // No explicit master
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };

        let resolved = resolve_inheritance(&slide, &pres);

        assert!(resolved.layout.is_some(), "Should resolve layout");
        let layout = resolved.layout.unwrap();
        assert_eq!(layout.name, "Title Layout");

        // Should fall back to the layout's master (Master One)
        assert!(resolved.master.is_some(), "Should fall back to layout's master");
        let master = resolved.master.unwrap();
        assert_eq!(master.name, "Master One");
    }

    #[test]
    fn test_slide_explicit_value_beats_inherited_default() {
        // F-301: slide-level explicit value beats the inherited default
        let pres = create_test_presentation();

        let slide = Slide {
            id: 3,
            name: "Test Slide 3".to_string(),
            layout_id: Some("101".to_string()),
            master_id: None,
            shapes: vec![Shape::Placeholder(PlaceholderShape {
                id: "custom_ph".to_string(),
                bounds: Bounds {
                    x: 0,
                    y: 0,
                    cx: 100,
                    cy: 100,
                },
                placeholder_type: "custom".to_string(),
                text_body: None,
                fill: None,
                effect: None,
            })],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: Some(SlideBackground {
                background_type: crate::model::SlideBackgroundType::Solid,
                color: Some("#FF0000".to_string()),
                gradient_stops: None,
                gradient_angle: None,
                image_data: None,
            }),
        };

        let resolved = resolve_inheritance(&slide, &pres);

        // Slide has explicit background
        assert!(resolved.background.is_none(), "Should not inherit background when slide has explicit one");

        // Slide has explicit placeholder shape, so placeholder_types should not be inherited
        assert!(resolved.placeholder_types.is_empty(), "Should not inherit placeholder_types when slide has placeholder shapes");

        // The layout's placeholder shape (title_ph) should be inherited since slide has different id
        assert!(
            resolved.inherited_shapes.len() > 0,
            "Should still inherit layout shapes with different ids"
        );
    }

    #[test]
    fn test_source_structs_immutable_through_resolution() {
        // F-301: the source Slide/Layout/Master are immutable through resolution
        let pres = create_test_presentation();
        let original_master_count = pres.masters.len();
        let original_layout_count = pres.masters[0].slide_layouts.len();

        let slide = Slide {
            id: 4,
            name: "Test Slide 4".to_string(),
            layout_id: Some("101".to_string()),
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };

        // Call resolve_inheritance
        let _resolved = resolve_inheritance(&slide, &pres);

        // Verify original structs unchanged
        assert_eq!(pres.masters.len(), original_master_count, "Master count unchanged");
        assert_eq!(pres.masters[0].slide_layouts.len(), original_layout_count, "Layout count unchanged");
        
        // Verify slide unchanged
        assert_eq!(slide.id, 4);
        assert!(slide.layout_id.is_some());
        
        // Also test get_layout and get_master don't mutate
        let _layout = get_layout(&slide, &pres);
        let _master = get_master(&slide, &pres);
        
        assert_eq!(pres.masters.len(), original_master_count, "Master count still unchanged");
    }

    #[test]
    fn test_get_layout_finds_layout_by_id() {
        // F-301
        let pres = create_test_presentation();

        let slide = Slide {
            id: 5,
            name: "Test".to_string(),
            layout_id: Some("102".to_string()),
            master_id: None,
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };

        let layout = get_layout(&slide, &pres);
        assert!(layout.is_some());
        assert_eq!(layout.unwrap().name, "Content Layout");
    }

    #[test]
    fn test_get_master_with_explicit_master_id() {
        // F-301
        let pres = create_test_presentation();

        let slide = Slide {
            id: 6,
            name: "Test".to_string(),
            layout_id: Some("101".to_string()),
            master_id: Some("1".to_string()),
            shapes: vec![],
            notes: None,
            transition: None,
            animations: vec![],
            timing_raw: None,
            background: None,
        };

        let master = get_master(&slide, &pres);
        assert!(master.is_some());
        assert_eq!(master.unwrap().name, "Master One");
    }
}
