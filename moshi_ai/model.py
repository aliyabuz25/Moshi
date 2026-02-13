import torch
import torch.nn as nn
import torch.nn.functional as F
import random
import os
import threading
import math
from torch.optim.lr_scheduler import OneCycleLR

class Tokenizer:
    def __init__(self, text):
        self.chars = sorted(list(set(text)))
        self.char_to_ix = { ch:i for i,ch in enumerate(self.chars) }
        self.ix_to_char = { i:ch for i,ch in enumerate(self.chars) }
        self.vocab_size = len(self.chars)

    def encode(self, text):
        return torch.tensor([self.char_to_ix[ch] for ch in text if ch in self.char_to_ix], dtype=torch.long)

    def decode(self, indices):
        return ''.join([self.ix_to_char[ix.item()] for ix in indices])

class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=1024):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe)

    def forward(self, x):
        return x + self.pe[:x.size(1)]

class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff, dropout=0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, n_heads, dropout=dropout, batch_first=True)
        self.norm1 = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout)
        )
        self.norm2 = nn.LayerNorm(d_model)

    def forward(self, x, mask=None):
        attn_out, _ = self.attn(x, x, x, attn_mask=mask, need_weights=False)
        x = self.norm1(x + attn_out)
        ff_out = self.ff(x)
        x = self.norm2(x + ff_out)
        return x

class MoshiTransformer(nn.Module):
    def __init__(self, vocab_size, d_model=384, n_heads=8, n_layers=6, d_ff=1024, max_len=768, dropout=0.1):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoding = PositionalEncoding(d_model, max_len)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, n_heads, d_ff, dropout) for _ in range(n_layers)
        ])
        self.fc_out = nn.Linear(d_model, vocab_size)
        self.max_len = max_len

    def forward(self, x):
        batch, seq = x.shape
        mask = torch.triu(torch.ones(seq, seq, device=x.device) * float('-inf'), diagonal=1)
        x = self.embedding(x)
        x = self.pos_encoding(x)
        for block in self.blocks:
            x = block(x, mask=mask)
        return self.fc_out(x)

# --- Global State ---
model = None
tokenizer = None
dataset_content = ""
training_status = "Unitialized"
model_lock = threading.Lock()
total_tokens_processed = 0 # Character level tokens
checkpoint_path = "datas/moshi_brain.pt"

def load_data(path):
    global dataset_content, tokenizer
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            dataset_content = f.read()
        vocab = sorted(list(set(dataset_content + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/=\"' !@#$%^&*()_+-=[]{};:,.\\n\\t[]")))
        tokenizer = Tokenizer("".join(vocab))
        return True
    return False

def train_loop_autonomous():
    global model, tokenizer, dataset_content, training_status
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Moshi Elite Brain starting on {device}...")
    
    with model_lock:
        if model is None:
            model = MoshiTransformer(tokenizer.vocab_size).to(device)
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
    data_tensor = tokenizer.encode(dataset_content).to(device)
    seq_len = 384
    batch_size = 8
    
    # Advanced Scheduler for Fast Convergence
    max_steps = 20000
    scheduler = OneCycleLR(optimizer, max_lr=1e-3, total_steps=max_steps, pct_start=0.05)
    
    step = 0
    
    # Persistent Load
    if os.path.exists(checkpoint_path):
        try:
            with model_lock:
                checkpoint = torch.load(checkpoint_path, map_location=device)
                model.load_state_dict(checkpoint['model_state'])
                optimizer.load_state_dict(checkpoint['optimizer_state'])
                step = checkpoint.get('step', 0)
                print(f"Moshi Brain Resumed from Step {step}")
        except Exception as e:
            print(f"Checkpoint load error: {e}")
    
    while True:
        model.train()
        inner_steps = 20
        total_loss = 0
        for _ in range(inner_steps):
            # Batching logic
            batch_indices = [random.randint(0, len(data_tensor) - seq_len - 1) for _ in range(batch_size)]
            chunks = torch.stack([data_tensor[i:i+seq_len] for i in batch_indices])
            
            inputs = chunks[:, :-1]
            targets = chunks[:, 1:]
            
            optimizer.zero_grad()
            logits = model(inputs)
            loss = F.cross_entropy(logits.reshape(-1, tokenizer.vocab_size), targets.reshape(-1))
            loss.backward()
            
            # Gradient Clipping
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()
            step += 1
            if step >= max_steps: break
            
        training_status = f"Turbo Sync: Intensity High (Loss {total_loss/inner_steps:.4f})"
        
        # Periodic Checkpoint
        if step % 100 == 0:
            torch.save({
                'model_state': model.state_dict(),
                'optimizer_state': optimizer.state_dict(),
                'step': step
            }, checkpoint_path)

        if step >= max_steps: 
            training_status = f"Brain Optimized (Step {step})"
            break

def generate_text(instruction, max_new_tokens=256, temperature=0.5):
    global model, tokenizer
    if model is None: return "Brain not initialized."
    
    device = next(model.parameters()).device
    model.eval()
    
    # Clean instruction to prevent context poisoning
    clean_instr = instruction.strip()[:100]
    full_prompt = f"[PROMPT] {clean_instr} [CODE] "
    
    with torch.no_grad():
        with model_lock:
            safe_text = "".join([c if c in tokenizer.char_to_ix else " " for c in full_prompt])
            idx = tokenizer.encode(safe_text).unsqueeze(0).to(device)
            predicted = ""
            
            for _ in range(max_new_tokens):
                idx_cond = idx[:, -384:] # Match training seq_len
                logits = model(idx_cond)
                logits = logits[:, -1, :] / temperature
                probs = F.softmax(logits, dim=-1)
                
                next_token = torch.multinomial(probs, num_samples=1)
                char = tokenizer.ix_to_char[next_token.item()]
                
                if char == "[" or "[END]" in predicted: break
                predicted += char
                idx = torch.cat((idx, next_token), dim=1)
            
            global total_tokens_processed
            total_tokens_processed += len(idx[0])
                
    return predicted.replace("[END]", "").strip(), len(idx[0])
