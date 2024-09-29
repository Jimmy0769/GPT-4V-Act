const { app, BrowserWindow, ipcMain, webContents } = require("electron");
const { promisify } = require("util");
const path = require("node:path");
const fs = require("fs/promises");

const sleep = promisify(setTimeout);

let win;

// const { GPT4V, LLaVa } = require('./agents');
const { GPT4V } = require("./agents");
const controller = new GPT4V();

function extractJsonFromMarkdown(mdString) {
  const regex = /```json\s*([\s\S]+?)\s*```/; // This captures content between ```json and ```

  const match = mdString.match(regex);
  if (!match) return null; // No JSON block found

  const jsonString = match[1].trim();

  try {
    return JSON.parse(jsonString);
  } catch (err) {
    console.error("Failed to parse JSON:", err);
    return null; // Invalid JSON content
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#18181b",
      symbolColor: "#74b1be",
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  // win.webContents.openDevTools();

  // 处理外部链接打开行为
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.log("🚀 ~ win.webContents.setWindowOpenHandler ~ url:", url);
    // 告诉渲染进程中的 <webview> 加载新 URL
    mainWindow.webContents.send("navigate-webview", url);
    return { action: "deny" }; // 阻止默认行为（阻止新窗口打开）
  });

  ipcMain.on("current-url", (event, url) => {
    win.webContents.send("update-url", url);
  });

  win.loadFile("index.html");
}

app.commandLine.appendSwitch("--disable-gpu", "true");

app.whenReady().then(async () => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("web-contents-created", (e, wc) => {
    // wc: webContents of <webview> is now under control
    wc.setWindowOpenHandler((handler) => {
      console.log("🚀 ~ wc.setWindowOpenHandler ~ handler:", handler);
      wc.loadURL(handler.url);
      return { action: "deny" }; // deny or allow
    });
  });

  let webview;
  let labelData;
  ipcMain.on("webview-ready", async (event, id) => {
    webview = webContents.fromId(id);
    console.log(`Acquired webviewId ${id}`);
  });

  ipcMain.on("label-data", (event, data) => {
    labelData = JSON.parse(data);
  });

  async function screenshot() {
    webview.send("observer", "screenshot-start");
    await sleep(100);
    const image = await webview.capturePage();
    webview.send("observer", "screenshot-end");

    // const imageData = image.toPNG();
    const imageData = image.toJPEG(80);
    await controller.uploadImageData(imageData);
  }

  ipcMain.on("screenshot", async (event, id) => screenshot());

  let currentTask;

  ipcMain.on("send", async (event, text) => {
    currentTask = text;
    await screenshot();
    await controller.send(text);
  });

  ipcMain.on("continue", async (event, text) => {
    await screenshot();
    await controller.send(currentTask);
  });

  let action = () => {};
  ipcMain.on("execute", async (event, text) => {
    action();
  });

  controller.on("message", (message) => {
    win.webContents.send("message", message);
  });

  controller.on("end_turn", (content) => {
    if (BrowserWindow.getAllWindows().length === 0) return;

    const data = extractJsonFromMarkdown(content);
    let msg = data === null ? content : data.thought;
    win.webContents.send("end_turn", msg);

    action = () => {
      if (data != null) {
        let label;
        if (data.nextAction.element) {
          label = labelData.find((i) => i.id == data.nextAction.element);
          win.webContents.send("message", label);
        }

        switch (data.nextAction.action) {
          case "click":
            console.log(`clicking ${JSON.stringify(label)}`);
            let { x, y } = label;
            webview.sendInputEvent({
              type: "mouseDown",
              x,
              y,
              clickCount: 1,
            });
            webview.sendInputEvent({
              type: "mouseUp",
              x,
              y,
              clickCount: 1,
            });
            break;
          case "type": {
            console.log(
              `typing ${data.nextAction.text} into ${JSON.stringify(
                labelData[data.nextAction.element]
              )}`
            );
            let { x, y } = label;
            webview.sendInputEvent({
              type: "mouseDown",
              x,
              y,
              clickCount: 1,
            });
            webview.sendInputEvent({
              type: "mouseUp",
              x,
              y,
              clickCount: 1,
            });

            for (let char of data.nextAction.text) {
              webview.sendInputEvent({
                type: "char",
                keyCode: char,
              });
            }

            break;
          }
          default:
            console.log(`unknown action ${JSON.stringify(data.nextAction)}`);
            break;
        }
      }
    };
  });

  await controller.initialize();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
