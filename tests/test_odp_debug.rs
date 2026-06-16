use wo_x2t::router::ConversionRouter;

fn main() {
    let router = ConversionRouter::new();
    let wo_json = r#"{
        "version": 1,
        "slideSize": "widescreen",
        "themeType": "default",
        "slides": [{
            "id": "slide1",
            "title": "Test Slide",
            "layout": "title",
            "shapes": [{
                "id": "shape1",
                "type": "textbox",
                "x": 1.0, "y": 1.0, "width": 10.0, "height": 5.0,
                "rotation": 0.0, "zIndex": 1,
                "text": "Hello ODP World!"
            }]
        }]
    }"#;

    // WoPresentation → ODP
    let odp_result = router.convert("wo-presentation", "odp", wo_json.as_bytes());
    let odp_bytes = odp_result.output.unwrap().data;

    // ODP → WoPresentation
    let wo_result = router.convert("odp", "wo-presentation", &odp_bytes);
    let wo_output = wo_result.output.unwrap().data;
    let wo_str = String::from_utf8(wo_output).unwrap();
    println!("{}", wo_str);
}
