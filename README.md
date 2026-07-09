# Void

Void is an AI-powered web app builder featuring a Next.js frontend and a FastAPI backend.

## Prerequisites

- [Node.js](https://nodejs.org/) (for the client)
- [Python 3.11+](https://www.python.org/) (for the server)
- [`uv`](https://github.com/astral-sh/uv) (for managing Python dependencies on the server)

## Local Setup Instructions

To run this project locally, you will need to start both the server and the client in separate terminal windows.

### 1. Server Setup (FastAPI Backend)

1. Open a terminal and navigate to the `server` directory:
   ```bash
   cd server
   ```
2. If this is your first time setting up the project, install the Python dependencies using `uv` (this will also create the `.venv` directory required by the run script):
   ```bash
   uv sync
   ```
3. Ensure you have a `.env` file in the `server` directory containing the required API keys:
   ```env
   GROQ_API_KEY=your_key_here
   GROQ_API_KEY_TWIN=your_key_here
   HUGGING_TOKEN=your_token_here
   ```
4. Start the backend server by running the provided batch script:
   ```bash
   .\dev
   ```
   The backend will typically start on `http://localhost:8000` (or the port configured in Uvicorn).

### 2. Client Setup (Next.js Frontend)

1. Open a new terminal and navigate to the `client` directory:
   ```bash
   cd client
   ```
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. The client will be available at [http://localhost:3000](http://localhost:3000). Open this URL in your browser to view the application.

## Tech Stack
- **Frontend**: Next.js (React 19), TailwindCSS v4, Monaco Editor
- **Backend**: Python 3.11+, FastAPI, LangGraph, Groq
