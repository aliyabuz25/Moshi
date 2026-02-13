from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import threading
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from moshi_ai.model import load_data, train_loop_autonomous, generate_text, training_status
from sync_manager import sync_manager

app = Flask(__name__)
CORS(app)

# --- Initialize Brain ---
# Startup Sync
try:
    sync_manager.pull_global()
except:
    print("Sync Hub offline. Running in local mode.")

load_data('datas/dataset.txt')

# Start Background Training Thread
train_thread = threading.Thread(target=train_loop_autonomous, daemon=True)
train_thread.start()

# --- System Routes ---

@app.route('/status', methods=['GET'])
def fetch_system_status():
    """Returns engine health and synchronization state."""
    from moshi_ai import model
    return jsonify({
        "status": model.training_status,
        "total_tokens": model.total_tokens_processed,
        "sync_status": sync_manager.check_status()
    })

@app.route('/ai/sync', methods=['POST'])
def handle_global_sync():
    """Triggers federated learning synchronization hub."""
    # 1. Dispatch local delta to upstream
    sync_manager.contribute_local()
    
    # 2. Pull global architecture refinements
    sync_log = sync_manager.pull_global()
    return jsonify({
        "message": "Global Brain Synchronized",
        "details": sync_log
    })

# --- Neural Interface ---
def chat():
    data = request.json
    user_message = data.get('message', '').lower()
    context = data.get('context', {})
    
@app.route('/chat', methods=['POST'])
def process_neural_query():
    """Main entry point for Moshi-v1 synthesis queries."""
    payload = request.json
    raw_query = payload.get('message', '').lower()
    input_context = payload.get('context', {})
    
    result_package = {"message": "", "files": {}}

    # Handle internal command triggers
    if "train" in raw_query:
        from moshi_ai import model
        result_package["message"] = f"Moshi Training Engine is hot. Current Flux: {model.training_status}"
    
    elif any(trigger in raw_query for trigger in ["generate", "code", "make", "create", "build", "explain", "fix", "refactor"]):
        # Clean the intent from redundant markers
        clean_intent = raw_query.replace("moshi", "").replace("generate", "").replace("code", "").strip()
        
        # Hydrate prompt with active file context if provided
        if input_context.get('content'):
            clean_intent = f"Ref: {input_context['path']}\nData: {input_context['content']}\n\nObjective: {clean_intent}"
            
        if not clean_intent: 
            clean_intent = "boilerplate scaffolding"
        
        try:
            # The model now understands Prompts!
            synthesis, token_overhead = generate_text(clean_intent)
            result_package["tokens_used"] = token_overhead
            
            # Auto-Learning: Append successful synthesis to local dataset
            # This is the core of the federated learning mechanism
            if len(synthesis) > 20:
                with open('datas/dataset.txt', 'a') as f:
                    f.write(f"\n[PROMPT] {clean_intent} [CODE] {synthesis} [END]")

            # Wrap synthesis for the frontend parser
            if "<" in synthesis or "{" in synthesis or "body" in synthesis:
                 result_package["message"] = f"Moshi-v1 Synthesis:\n```html\n{synthesis}\n```"
            else:
                 result_package["message"] = f"Moshi-v1 Output: {synthesis}"
        except Exception as e:
            result_package["message"] = f"Brain busy or syncing. Try again.\nSystem Log: {str(e)}"
    else:
        result_package["message"] = "Moshi node is active. I'm ready for a synthesis objective."

    return jsonify(result_package)

if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False) # Reloader off to prevent multiple threads
