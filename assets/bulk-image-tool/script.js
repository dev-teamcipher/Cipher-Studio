document.addEventListener('DOMContentLoaded', () => {
    // Nav
    const backBtn = document.getElementById('back-btn');
    backBtn.addEventListener('click', () => {
        if(window.parent && window.parent.ToolsHub) { 
            window.parent.ToolsHub.switchTool('hub'); 
        }
    });

    // Settings
    let selectedRatio = '16:9';
    const ratioBtns = document.querySelectorAll('.ratio-btn');
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ratioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRatio = btn.getAttribute('data-ratio');
        });
    });

    // Editor
    const promptsInput = document.getElementById('prompts-input');
    const promptCount = document.getElementById('prompt-count');
    const clearBtn = document.getElementById('clear-btn');
    const generateBtn = document.getElementById('generate-btn');
    const galleryGrid = document.getElementById('gallery-grid');
    const downloadAllBtn = document.getElementById('download-all-btn');

    promptsInput.addEventListener('input', updateCount);

    function updateCount() {
        const text = promptsInput.value.trim();
        if (!text) {
            promptCount.textContent = '0 Prompts';
            return;
        }
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        promptCount.textContent = `${lines.length} Prompt${lines.length !== 1 ? 's' : ''}`;
    }

    clearBtn.addEventListener('click', () => {
        promptsInput.value = '';
        updateCount();
    });

    generateBtn.addEventListener('click', async () => {
        const text = promptsInput.value.trim();
        if (!text) return;
        const prompts = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (prompts.length === 0) return;

        // UI State
        generateBtn.classList.add('disabled');
        generateBtn.innerHTML = '<span class="loading-spinner" style="position:relative; width:16px; height:16px; transform:none; display:inline-block; vertical-align:middle; margin-right:8px;"></span> Generating...';
        
        galleryGrid.classList.remove('empty');
        if (galleryGrid.querySelector('.empty-state')) {
            galleryGrid.innerHTML = '';
        }

        const style = document.getElementById('art-style').value;
        const negPrompt = document.getElementById('negative-prompt').value;

        // Create placeholders for each prompt
        const placeholders = prompts.map(prompt => {
            const card = document.createElement('div');
            card.className = 'img-card';
            card.innerHTML = `
                <div class="img-wrap" data-ratio="${selectedRatio}">
                    <div class="loading-spinner"></div>
                </div>
                <div class="img-prompt">${prompt}</div>
            `;
            galleryGrid.prepend(card);
            return { card, prompt };
        });

        // Simulate generation (Since this is a frontend-only tool for now, we use a placeholder image service)
        // In reality, this would fetch from the user's custom backend.
        
        for (let i = 0; i < placeholders.length; i++) {
            const item = placeholders[i];
            
            // Artificial delay to simulate processing
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
            
            // For white-labeling, we just use a generic placeholder that looks generated.
            // Using a free stock photo service just to show the UI working.
            const w = selectedRatio === '16:9' ? 800 : (selectedRatio === '9:16' ? 450 : 600);
            const h = selectedRatio === '16:9' ? 450 : (selectedRatio === '9:16' ? 800 : 600);
            
            // Random seed so images differ
            const seed = Math.floor(Math.random() * 100000);
            const imgUrl = `https://picsum.photos/seed/${seed}/${w}/${h}`;
            
            item.card.querySelector('.img-wrap').innerHTML = `
                <img src="${imgUrl}" alt="Generated Image" onload="this.style.opacity=1" style="opacity:0; transition: opacity 0.5s;">
                <div class="img-overlay">
                    <button class="img-btn" title="Download" onclick="window.open('${imgUrl}', '_blank')">⬇️</button>
                    <button class="img-btn" title="Delete" onclick="this.closest('.img-card').remove()">🗑️</button>
                </div>
            `;
        }

        generateBtn.classList.remove('disabled');
        generateBtn.innerHTML = '<span class="btn-icon">✨</span> Generate Images';
        downloadAllBtn.classList.remove('disabled');
    });
});
