const {
  app,
  BrowserWindow,
  ipcMain,
  webContents,
  BrowserView,
} = require("electron");
const { promisify } = require("util");
const path = require("node:path");
const fs = require("fs/promises");

const sleep = promisify(setTimeout);

let win;
let view;

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

  view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "preload-view.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  win.setBrowserView(view);
  view.webContents.loadURL("https://www.tianyancha.com");
  view.setBounds({ x: 0, y: 0, width: 400, height: 400 });

  win.webContents.openDevTools();

  // 处理外部链接打开行为
  view.webContents.setWindowOpenHandler(({ url }) => {
    console.log("🚀 ~ view.webContents.setWindowOpenHandler ~ url:", url);
    // 告诉渲染进程中的 <webview> 加载新 URL
    view.webContents.loadURL(url);
    return { action: "deny" }; // 阻止默认行为（阻止新窗口打开）
  });

  view.webContents.on("will-navigate", (event, navigationUrl) => {
    console.log("🚀 ~ view.webContents.on ~ navigationUrl:", navigationUrl);
    win.webContents.send("update-url", navigationUrl);
  });

  ipcMain.on("current-url", (event, url) => {
    win.webContents.send("update-url", url);
  });

  ipcMain.on("set-view-size", (event, size) => {
    view.setBounds(size);
  });

  // 窗口大小变化时需要同步更新view的大小和位置
  win.on("resize", () => {
    win.webContents.send("update-view-size");
  });

  ipcMain.on("navigate-view", (event, action, payload) => {
    view.webContents.send("navigate-view", action, payload);
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

  // let webview;
  let labelData;
  // ipcMain.on("webview-ready", async (event, id) => {
  //   webview = webContents.fromId(id);
  //   console.log(`Acquired webviewId ${id}`);
  // });

  ipcMain.on("label-data", (event, data) => {
    labelData = JSON.parse(data);
  });

  let lastImage;

  async function screenshot() {
    // 在标注页面前截图用于判断当前页面是否发生改变，避免再次调用gpt时执行同样的操作
    const imageBeforeMark = await view.webContents.capturePage();
    const imageBeforeMarkDataUrl = imageBeforeMark.toDataURL();

    if (lastImage && imageBeforeMarkDataUrl === lastImage) {
      return false;
    } else {
      lastImage = imageBeforeMarkDataUrl;

      view.webContents.send("observer", "screenshot-start");
      await sleep(100);
      const image = await view.webContents.capturePage();
      view.webContents.send("observer", "screenshot-end");

      // const imageData = image.toPNG();
      const imageData = image.toJPEG(80);
      await controller.uploadImageData(imageData);
      return true;
    }
  }

  ipcMain.on("screenshot", async (event, id) => screenshot());

  let currentTask;

  ipcMain.on("send", async (event, text) => {
    currentTask = text;
    await screenshot();
    await controller.send(text);
  });

  ipcMain.on("continue", async (event, text) => {
    const flag = await screenshot();
    if (flag) await controller.send(currentTask);
  });

  let action = () => {};
  ipcMain.on("execute", async (event, text) => {
    action();
    setTimeout(async () => {
      const flag = await screenshot();
      if (flag) await controller.send(currentTask);
    }, 2000);
  });

  controller.on("message", (message) => {
    win.webContents.send("message", message);
  });

  controller.on("end_turn", (content) => {
    if (BrowserWindow.getAllWindows().length === 0) return;

    const data = extractJsonFromMarkdown(content);
    console.log("🚀 ~ controller.on ~ data:", data);
    // let msg = data === null ? content : data.thought;
    win.webContents.send("end_turn", data || content);

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
            view.webContents.sendInputEvent({
              type: "mouseDown",
              x,
              y,
              clickCount: 1,
            });
            view.webContents.sendInputEvent({
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
            view.webContents.sendInputEvent({
              type: "mouseDown",
              x,
              y,
              clickCount: 1,
            });
            view.webContents.sendInputEvent({
              type: "mouseUp",
              x,
              y,
              clickCount: 1,
            });

            for (let char of data.nextAction.text) {
              view.webContents.sendInputEvent({
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
