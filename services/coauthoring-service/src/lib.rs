// coauthoring-service — World-Office real-time collaboration microservice
//
// Library crate exposing the collaboration wire schema (ModelOpEnvelope)
// for use by other services and WASM bindings. The binary entry point
// lives in main.rs.

pub mod model_op;

// Re-export the wire envelope for convenience.
pub use model_op::{EnvelopeError, ModelOpEnvelope, WIRE_SCHEMA_VERSION};
