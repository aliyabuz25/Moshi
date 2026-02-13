import random
import os

def generate_logical_syntax_dataset(output_path):
    """
    Logical Syntax Composition Engine
    Teaches Moshi to map Prompts to Coherent Syntax Patterns.
    """

    # --- HTML Atoms ---
    tags = ["div", "section", "main", "header", "footer", "form", "nav", "article"]
    inputs = ["text", "email", "password", "submit"]
    
    # --- CSS Atoms ---
    css_snippets = {
        "layout": ["display: flex; justify-content: center; align-items: center;", "display: grid; gap: 20px;", "padding: 20px; background: #1e293b;"],
        "style": ["color: white; border-radius: 8px;", "border: 1px solid #334155;", "box-shadow: 0 4px 6px rgba(0,0,0,0.1);"],
        "animation": ["animation: fadeIn 0.5s ease;", "transition: all 0.3s ease;"]
    }

    # --- JS Atoms ---
    js_atoms = {
        "event": ['el.addEventListener("click", () => { console.log("Clicked"); });', 'form.addEventListener("submit", (e) => { e.preventDefault(); alert("Sent"); });'],
        "dom": ['document.getElementById("app").innerHTML = "Updated";', 'const btn = document.querySelector(".btn");', 'document.body.classList.toggle("dark");'],
        "logic": ['handleSave = () => { localStorage.setItem("data", "saved"); };', 'fetchData = async () => { const res = await fetch("/api"); };']
    }

    print(f"Generating Logical Dataset to {output_path}...")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        # Generate 6000 high-quality logical instances
        for _ in range(6000):
            # Pick a Category
            cat = random.choice(["html", "css", "js", "full"])
            
            if cat == "html":
                t = random.choice(tags)
                p = f"create a {t}"
                c = f"<{t} class='container'>Content</{t}>"
            elif cat == "css":
                p = "style a container"
                c = f".container {{ {random.choice(css_snippets['layout'])} {random.choice(css_snippets['style'])} }}"
            elif cat == "js":
                p = "add an event"
                c = f"<script>{random.choice(js_atoms['event'])}</script>"
            else:
                p = "build a card"
                c = f"<div style='{random.choice(css_snippets['layout'])}'><h3>Card</h3><button onclick='alert(\"Hi\")'>Click</button></div>"
            
            f.write(f"[PROMPT] {p} [CODE] {c} [END]\n")

    print(f"SUCCESS: Logical Dataset generated.")

if __name__ == "__main__":
    generate_logical_syntax_dataset("datas/dataset.txt")
