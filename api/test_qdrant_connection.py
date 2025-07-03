import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

# Load environment variables from .env file in the current directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "pdf_vectors")

print(f"--- Qdrant Connection Test ---")
print(f"QDRANT_URL: {QDRANT_URL}")
print(f"QDRANT_API_KEY: {QDRANT_API_KEY[:5]}...{QDRANT_API_KEY[-5:] if QDRANT_API_KEY else 'N/A'}") # Mask key
print(f"QDRANT_COLLECTION: {QDRANT_COLLECTION}")

try:
    client = QdrantClient(
        url=QDRANT_URL,
        api_key=QDRANT_API_KEY,
    )
    print("Qdrant client initialized successfully.")

    # Try to get existing collections
    collections_response = client.get_collections()
    print("Existing Collections:", [c.name for c in collections_response.collections])

    # Try to create the specific collection if it doesn't exist
    try:
        client.get_collection(collection_name=QDRANT_COLLECTION)
        print(f"Collection '{QDRANT_COLLECTION}' already exists.")
    except Exception as e:
        print(f"Collection '{QDRANT_COLLECTION}' not found, attempting to create... Error: {e}")
        client.recreate_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=qmodels.VectorParams(
                size=1536,  # OpenAI text-embedding-3-small size
                distance=qmodels.Distance.COSINE,
            ),
        )
        print(f"Collection '{QDRANT_COLLECTION}' created successfully.")

    print("--- Test Complete ---")

except Exception as e:
    print(f"!!! ERROR during Qdrant connection test: {e}")
    print("Please check your QDRANT_URL, QDRANT_API_KEY, and network connection.") 