let isFetched = false;
let cookieData = "";

const actionBtn = document.getElementById('action-btn');
const outputArea = document.getElementById('output');
const statusMsg = document.getElementById('status-msg');

actionBtn.addEventListener('click', async () => {
  if (!isFetched) {
    const targetDomain = "riotgames.com";
    const required = ["ssid", "tdid", "csid", "clid"];
    
    try {
      const cookies = await chrome.cookies.getAll({ domain: targetDomain });
      
      const filtered = cookies.filter(c => required.includes(c.name));
      
      if (filtered.length > 0) {
        const cookieMap = new Map();
        filtered.forEach(c => cookieMap.set(c.name, c.value));
        
        cookieData = Array.from(cookieMap)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
        
        outputArea.value = cookieData;
        
        isFetched = true;
        actionBtn.innerText = "Copy to Clipboard";
        actionBtn.style.background = "#00bb88";
        statusMsg.innerText = `Status: Found ${cookieMap.size} cookie!`;
        
        if (!cookieMap.has('tdid') || !cookieMap.has('ssid')) {
           statusMsg.innerText += " (Missing tdid or ssid)";
           statusMsg.style.color = "#ffaa00";
        }

      } else {
        statusMsg.innerText = "Status: Cookie data not found!";
        alert("Cannot find cookie data. Please login first!");
      }
    } catch (error) {
      outputArea.value = "System error: " + error.message;
    }
    return;
  }

  if (isFetched) {
    navigator.clipboard.writeText(cookieData).then(() => {
      actionBtn.innerText = "Copied!";
      actionBtn.disabled = true;
      statusMsg.innerText = "Status: Copied to clipboard!";
      
      setTimeout(() => {
        isFetched = false;
        actionBtn.disabled = false;
        actionBtn.innerText = "Get Cookie String";
        actionBtn.style.background = "#ff4655";
        statusMsg.innerText = "Status: Ready";
        statusMsg.style.color = "#888";
      }, 3000);
    });
  }
});