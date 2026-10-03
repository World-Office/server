## ADDED Requirements

### Requirement: Admin Panel provides AI chat interface
The admin panel SHALL provide a browser-based AI chat interface with support for multiple AI providers.

#### Scenario: User opens AI chat page
- **WHEN** an authenticated admin navigates to the AI chat page
- **THEN** the page SHALL render a chat interface with a message input and conversation history

#### Scenario: User sends a chat message
- **WHEN** a user types a message and sends it
- **THEN** the frontend SHALL send the message to the AI proxy endpoint
- **AND** SHALL display the AI provider's response in the chat

#### Scenario: AI chat supports streaming responses
- **WHEN** an AI provider supports streaming
- **THEN** the chat interface SHALL display tokens incrementally as they arrive

### Requirement: Admin Panel manages AI provider configuration
The admin panel SHALL allow configuration of multiple AI providers including OpenAI, Anthropic, DeepSeek, Google Gemini, GPT4All, Groq, LM Studio, Mistral, Ollama, StabilityAI, Together AI, xAI, Zhipu, and custom providers.

#### Scenario: User views AI providers
- **WHEN** an authenticated admin navigates to AI provider settings
- **THEN** the page SHALL display a list of configured providers with name, model, and status

#### Scenario: User adds a new AI provider
- **WHEN** an admin fills in the provider form (name, API URL, API key, model)
- **THEN** the system SHALL validate the provider by making a test request
- **AND** SHALL save the provider configuration to the backend

#### Scenario: User enables/disables a provider
- **WHEN** an admin toggles a provider's enabled state
- **THEN** the system SHALL update the provider's status in the backend

### Requirement: AI proxy endpoint forwards requests to configured providers
The DocService SHALL provide an AI proxy endpoint that forwards chat requests from the editor to the configured AI provider.

#### Scenario: Editor sends AI request via proxy
- **WHEN** an editor sends an AI request to the proxy endpoint
- **THEN** the proxy SHALL forward the request to the appropriate provider
- **AND** SHALL return the provider's response to the editor

#### Scenario: AI proxy uses configured provider URL and key
- **WHEN** the proxy forwards a request
- **THEN** it SHALL use the provider's configured API URL and key
- **AND** SHALL NOT expose the API key to the frontend

### Requirement: Admin Panel configures AI settings
The admin panel SHALL provide settings for AI integration including timeout, CORS origins, and proxy URL.

#### Scenario: User configures AI settings
- **WHEN** an admin modifies AI settings (timeout, CORS, proxy URL)
- **THEN** the system SHALL save the settings via the admin config API
- **AND** SHALL apply the new settings on the next AI request
