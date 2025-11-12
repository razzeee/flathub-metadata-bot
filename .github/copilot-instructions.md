# Metadata Bot Project Instructions

This is a Deno + LangChain project for automating keyword generation for Flathub apps and creating pull requests.

## Project Structure

- Uses Deno 2.x with TypeScript
- LangChain for LLM integration
- Interacts with Flathub API v2
- Automates PR creation for app metadata improvements

## Development Guidelines

- Use Deno-compatible imports (npm: specifier for npm packages)
- Follow TypeScript strict mode
- Use environment variables for API keys
- Keep API client, LLM logic, and PR automation modular
