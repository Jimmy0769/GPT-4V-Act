const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", function () {
  // mini-browser setup

  // const webview = document.getElementById("webview");
  function updateViewSize() {
    const viewBox = document.getElementById("webviewPlaceholder");

    // 获取占位元素的大小和位置
    const rect = viewBox.getBoundingClientRect();
    const rectData = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
    };

    ipcRenderer.send("set-view-size", rectData);
  }

  // 初始化view宽高和位置
  updateViewSize();

  ipcRenderer.on("update-view-size", updateViewSize);

  const urlInput = document.getElementById("urlInput");

  document.getElementById("backButton").addEventListener("click", () => {
    // webview.send("navigate-webview", "goBack");
    ipcRenderer.send("navigate-view", "goBack");
  });

  document.getElementById("forwardButton").addEventListener("click", () => {
    // webview.send("navigate-webview", "goForward");
    ipcRenderer.send("navigate-view", "goForward");
  });

  document.getElementById("reloadButton").addEventListener("click", () => {
    // webview.send("navigate-webview", "reload");
    ipcRenderer.send("navigate-view", "reload");
  });

  urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      // webview.send("navigate-webview", "loadURL", urlInput.value);
      ipcRenderer.send("navigate-view", "loadURL", urlInput.value);
    }
  });

  // webview.addEventListener("will-navigate", (details) => {
  //   console.log("🚀 ~ webview.addEventListener ~ details:", details);
  //   urlInput.value = details.url;
  // });

  ipcRenderer.on("update-url", (event, url) => {
    urlInput.value = url;
  });

  // webview.addEventListener("dom-ready", () => {
  //   console.log(
  //     "🚀 ~ webview.addEventListener ~ webview.getWebContentsId():",
  //     webview.getWebContentsId()
  //   );
  //   ipcRenderer.send("webview-ready", webview.getWebContentsId());
  // });

  // Agent stuff

  const inputElement = document.querySelector('input[type="text"]');
  const sendButton = document.querySelector("button#send");
  const chatContainer = document.querySelector("#chat-container");

  // document
  //   .querySelector("#screenshot")
  //   .addEventListener("click", () => ipcRenderer.send("screenshot"));
  // document
  //   .querySelector("#continue")
  //   .addEventListener("click", () => ipcRenderer.send("continue"));
  // document
  //   .querySelector("#execute")
  //   .addEventListener("click", () => ipcRenderer.send("execute"));

  // document
  //   .querySelector("#mark")
  //   .addEventListener("click", () =>
  //     webview.send("observer", "screenshot-start")
  //   );
  // document
  //   .querySelector("#unmark")
  //   .addEventListener("click", () =>
  //     webview.send("observer", "screenshot-end")
  //   );
  // document.querySelector('#export').addEventListener('click', () => ipcRenderer.send('export'));
  // document.querySelector('#randomize').addEventListener('click', () => ipcRenderer.send('randomize'));

  ipcRenderer.on("end_turn", (event, data) => {
    // Create the message div and its container
    const messageDiv = document.createElement("div");
    messageDiv.className =
      "py-2 px-3 bg-indigo-700 text-indigo-200 rounded-lg shadow-md break-words";
    messageDiv.textContent = data?.thought || data; // This ensures no HTML or scripts in `content` are executed

    const containerDiv = document.createElement("div");
    containerDiv.className = "mb-2 mr-8";
    containerDiv.appendChild(messageDiv);

    // Append the message to the chat container
    chatContainer.appendChild(containerDiv);

    // Scroll to the bottom to show the newest messages
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Automatically execute the next action when receiving a GPT response
    if (data?.nextAction?.action !== "done") {
      setTimeout(() => {
        ipcRenderer.send("execute");
      }, 1000);
    }
  });

  function sendMessage() {
    const userMessage = inputElement.value;
    if (!userMessage.trim()) return;

    // Append user's message
    chatContainer.innerHTML += `
          <div class="mb-2 ml-8">
              <div class="py-2 px-3 bg-zinc-200 text-zinc-700 rounded-lg shadow-md break-words">
                  ${userMessage}
              </div>
          </div>
      `;

    // Clear the input after sending the message
    inputElement.value = "";

    // Scroll to the bottom to show the newest messages
    chatContainer.scrollTop = chatContainer.scrollHeight;

    ipcRenderer.send("send", userMessage);
  }

  inputElement.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  sendButton.addEventListener("click", sendMessage);

  ipcRenderer.on("message", (event, message) => {
    console.log("🚀 ~ ipcRenderer.on ~ message:", message);
  });
});
