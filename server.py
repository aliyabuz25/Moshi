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
    
    response = {"message": "", "files": {}}

    if "train" in user_message:
        from moshi_ai import model
        response["message"] = f"Self-learning is active. Current State: {model.training_status}"
    
    elif any(cmd in user_message for cmd in ["generate", "code", "make", "create", "build", "explain", "fix", "refactor"]):
        prompt = user_message.replace("moshi", "").replace("generate", "").replace("code", "").strip()
        
        # Inject Context if available
        if context.get('content'):
            prompt = f"Context file ({context['path']}):\n{context['content']}\n\nTask: {prompt}"
            
        if not prompt: prompt = "html base"
        
        try:
            # The model now understands Prompts!
            generated, tokens = generate_text(prompt)
            response["tokens_used"] = tokens
            
            # Auto-Learning: Append successful synthesis to local dataset
            if len(generated) > 20: # Only learn meaningful code
                with open('datas/dataset.txt', 'a') as f:
                    f.write(f"\n[PROMPT] {prompt} [CODE] {generated} [END]")

            # Ensure code is always wrapped for the new UI parser
            if "<" in generated or "{" in generated or "body" in generated:
                 response["message"] = f"Moshi-v1 Synthesis:\n```html\n{generated}\n```"
            else:
                 response["message"] = f"Moshi-v1 Output: {generated}"
        except Exception as e:
            response["message"] = f"Brain busy or syncing. Try again.\nError: {str(e)}"
    else:
        response["message"] = "Moshi-v1 Autonomous Brain is active. Ask me to 'make something'."

    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False) # Reloader off to prevent multiple threads
