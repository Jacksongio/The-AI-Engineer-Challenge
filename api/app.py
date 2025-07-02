# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
import os
from typing import Optional
import shutil
from aimakerspace.text_utils import PDFLoader, CharacterTextSplitter
from aimakerspace.vectordatabase import VectorDatabase

# Initialize FastAPI application with a title
app = FastAPI(title="OpenAI Chat API")

# Configure CORS (Cross-Origin Resource Sharing) middleware
# This allows the API to be accessed from different domains/origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from any origin
    allow_credentials=True,  # Allows cookies to be included in requests
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers in requests
)

# Define the data model for chat requests using Pydantic
# This ensures incoming request data is properly validated
class ChatRequest(BaseModel):
    developer_message: str  # Message from the developer/system
    user_message: str      # Message from the user
    model: Optional[str] = "gpt-4.1-mini"  # Optional model selection with default
    api_key: str          # OpenAI API key for authentication

# Define the main chat endpoint that handles POST requests
@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Initialize OpenAI client with the provided API key
        client = OpenAI(api_key=request.api_key)
        global vector_db
        # If a PDF is indexed, use RAG
        if vector_db is not None:
            # Retrieve top 3 relevant chunks from the PDF
            relevant_chunks = vector_db.search_by_text(request.user_message, k=3, return_as_text=True)
            context = "\n---\n".join(relevant_chunks)
            rag_prompt = f"You are an assistant with access to the following PDF context. Use it to answer the user's question.\n\nContext:\n{context}\n\nUser question: {request.user_message}"
            messages = [
                {"role": "system", "content": "You are a helpful assistant that answers questions using the provided PDF context."},
                {"role": "user", "content": rag_prompt}
            ]
        else:
            # Fallback to original chat behavior
            messages = [
                {"role": "developer", "content": request.developer_message},
                {"role": "user", "content": request.user_message}
            ]
        # Create an async generator function for streaming responses
        async def generate():
            stream = client.chat.completions.create(
                model=request.model,
                messages=messages,
                stream=True
            )
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
        return StreamingResponse(generate(), media_type="text/plain")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Define a health check endpoint to verify API status
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

# Global variable to store the vector database for the last uploaded PDF
vector_db = None

@app.post("/api/upload_pdf")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    uploads_dir = "uploads"
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    # Index the PDF using aimakerspace
    try:
        loader = PDFLoader(file_path)
        documents = loader.load_documents()  # List of extracted text
        splitter = CharacterTextSplitter(chunk_size=500, chunk_overlap=100)
        chunks = []
        for doc in documents:
            for chunk in splitter.split(doc):
                if len(chunk) <= 4000:  # Safety net
                    chunks.append(chunk)
        print(f"Number of chunks: {len(chunks)}")
        print(f"Max chunk length: {max(len(chunk) for chunk in chunks) if chunks else 0}")
        if chunks:
            print(f"First chunk: {chunks[0][:200]}")
        global vector_db
        vector_db = VectorDatabase()
        vector_db = await vector_db.abuild_from_list(chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF indexing failed: {str(e)}")
    return {"filename": file.filename, "message": "PDF uploaded and indexed successfully."}

# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
