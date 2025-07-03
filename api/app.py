# Import required FastAPI components for building the API
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
# Import Pydantic for data validation and settings management
from pydantic import BaseModel
# Import OpenAI client for interacting with OpenAI's API
from openai import OpenAI
from dotenv import load_dotenv
import os
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
from typing import Optional
import shutil
from aimakerspace.text_utils import PDFLoader, CharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from collections import Counter
import nltk
nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords
import string
from aimakerspace.openai_utils.embedding import EmbeddingModel

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
    pdf_filename: str      # The filename of the PDF to use for RAG

# Define the main chat endpoint that handles POST requests
@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # Initialize OpenAI client with the API key from the environment
        api_key = os.getenv("OPENAI_API_KEY")
        print("OPENAI_API_KEY:", api_key)
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY environment variable is not set on the backend.")
        client = OpenAI(api_key=api_key)
        # Generate embedding for user query
        embedder = EmbeddingModel()
        query_embedding = embedder.get_embedding(request.user_message)
        # Search Qdrant for relevant chunks for the selected PDF
        qdrant_client = QdrantClient(
            url=os.getenv("QDRANT_URL"),
            api_key=os.getenv("QDRANT_API_KEY"),
        )
        collection_name = os.getenv("QDRANT_COLLECTION", "pdf_vectors")
        search_result = qdrant_client.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=3,
            query_filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="filename",
                        match=qmodels.MatchValue(value=request.pdf_filename)
                    )
                ]
            )
        )
        relevant_chunks = [hit.payload["chunk"] for hit in search_result]
        context = "\n---\n".join(relevant_chunks)
        rag_prompt = f"You are an assistant with access to the following PDF context. Use it to answer the user's question.\n\nContext:\n{context}\n\nUser question: {request.user_message}"
        messages = [
            {"role": "system", "content": "You are a helpful assistant that answers questions using the provided PDF context."},
            {"role": "user", "content": rag_prompt}
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

qdrant_client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
)
collection_name = os.getenv("QDRANT_COLLECTION", "pdf_vectors")

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
        # Recreate the collection to ensure it has the proper filename index
        print("Recreating collection to ensure proper filename index...")
        qdrant_client.recreate_collection(
            collection_name=collection_name,
            vectors_config=qmodels.VectorParams(
                size=1536,  # for OpenAI embeddings
                distance=qmodels.Distance.COSINE,
            ),
        )
        # Create the filename payload index
        qdrant_client.create_payload_index(
            collection_name=collection_name,
            field_name="filename",
            field_type="keyword"
        )
        print(f"Collection '{collection_name}' recreated with filename index.")
        # Generate embeddings for each chunk and upsert to Qdrant
        embedder = EmbeddingModel()
        embeddings = embedder.get_embeddings(chunks)
        from uuid import uuid4
        points = [
            qmodels.PointStruct(
                id=str(uuid4()),
                vector=embedding,
                payload={
                    "filename": file.filename,
                    "chunk": chunk,
                    "chunk_index": i,
                },
            )
            for i, (embedding, chunk) in enumerate(zip(embeddings, chunks))
        ]
        qdrant_client.upsert(
            collection_name=collection_name,
            points=points
        )
        # --- Analytics Extraction ---
        # Combine all text for analytics
        all_text = " ".join(documents)
        # Lowercase, remove punctuation
        all_text = all_text.lower().translate(str.maketrans('', '', string.punctuation))
        # Tokenize
        words = all_text.split()
        # Remove stopwords
        stop_words = set(stopwords.words('english'))
        filtered_words = [w for w in words if w not in stop_words and len(w) > 2]
        # Count frequencies
        word_counts = Counter(filtered_words)
        top_words = word_counts.most_common(20)
        analytics = [{"word": w, "count": c} for w, c in top_words]
        # --- End Analytics Extraction ---
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF indexing failed: {str(e)}")
    # Get all filenames in the collection
    search_result = qdrant_client.scroll(collection_name=collection_name, limit=1000)
    filenames = set()
    for point in search_result[0]:
        if "filename" in point.payload:
            filenames.add(point.payload["filename"])
    return {"filename": file.filename, "message": "PDF uploaded and indexed successfully.", "analytics": analytics, "uploaded_filenames": list(filenames)}

# Entry point for running the application directly
if __name__ == "__main__":
    import uvicorn
    # Start the server on all network interfaces (0.0.0.0) on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
