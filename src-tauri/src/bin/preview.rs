//! Development-only, stdin/stdout transport. It does not listen on the network.
use prompt_recipe::{
    application::{self, Request},
    domain::Error,
};
use std::io::{self, Read};
fn main() {
    let result = (|| {
        let path = std::env::args()
            .nth(1)
            .ok_or_else(|| Error::new("preview", "Preview DB path required"))?;
        let mut text = String::new();
        io::stdin()
            .take(1024 * 1024)
            .read_to_string(&mut text)
            .map_err(|_| Error::new("preview", "Could not read request"))?;
        let request: Request =
            serde_json::from_str(&text).map_err(|_| Error::new("request", "Invalid request"))?;
        let mut conn = rusqlite::Connection::open(path).map_err(application::storage_error)?;
        application::initialize(&mut conn)?;
        application::dispatch(&mut conn, request)
    })();
    let value = match result {
        Ok(value) => serde_json::json!({"ok":value}),
        Err(error) => serde_json::json!({"error":error}),
    };
    println!("{value}");
}
