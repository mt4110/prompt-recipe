fn main() {
    if let Err(error) = prompt_recipe::desktop::run() {
        eprintln!("Prompt Recipe could not start: {error}");
        std::process::exit(1);
    }
}
