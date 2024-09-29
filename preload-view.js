const customCSS = `
    ::-webkit-scrollbar {
        width: 10px;
    }

    ::-webkit-scrollbar-track {
        background: #27272a;
    }

    ::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 0.375rem;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: #555;
    }
`;

window.addEventListener("DOMContentLoaded", () => {
  const styleTag = document.createElement("style");
  styleTag.textContent = customCSS;
  document.head.append(styleTag);
});

const { ipcRenderer } = require("electron");

// Listen for messages from preload.js to navigate
ipcRenderer.on("navigate-webview", (event, action, payload) => {
  switch (action) {
    case "goBack":
      if (window.history.length > 1) {
        window.history.back();
      }
      break;
    case "goForward":
      if (window.history.length > 1) {
        window.history.forward();
      }
      break;
    case "reload":
      window.location.reload();
      break;
    case "loadURL":
      window.location.href = payload;
      break;
  }
});

// 监听来自主进程的导航请求
ipcRenderer.on("navigate-webview", (event, url) => {
  webview.loadURL(url); // 在当前 <webview> 中加载新的 URL
});

// Send the current URL whenever it changes
window.addEventListener("load", () => {
  ipcRenderer.send("current-url", window.location.href);

  let oldHref = document.location.href;
  const body = document.querySelector("body");
  const observer = new MutationObserver((mutations) => {
    if (oldHref !== document.location.href) {
      oldHref = document.location.href;
      ipcRenderer.send("current-url", window.location.href);
    }
  });
  observer.observe(body, { childList: true, subtree: true });
});

window.addEventListener("beforeunload", () => {
  ipcRenderer.send("current-url", window.location.href);
});

window.addEventListener("popstate", () => {
  ipcRenderer.send("current-url", window.location.href);
});

ipcRenderer.on("randomize", (event) => {
  // Define random x and y coordinates within the dimensions of the document
  var x = Math.floor(Math.random() * (document.body.scrollWidth + 1));
  var y = Math.floor(Math.random() * (document.body.scrollHeight + 1));

  // Scroll to the random positions
  window.scrollTo(x, y);
});

ipcRenderer.on("shuffle", (event) => {
  // Helper function to shuffle a string
  function shuffleString(str) {
    var arr = str.split("");
    var len = arr.length;

    // While there remain elements to shuffle…
    for (var i = len - 1; i > 0; i--) {
      // Pick a remaining element…
      var j = Math.floor(Math.random() * (i + 1));
      // And swap it with the current element.
      var temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }

    return arr.join(""); // Convert Array back to string
  }

  function shuffleChildren(parent) {
    if (parent.children && parent.children.length > 0) {
      var children = Array.from(parent.children);
      while (children.length) {
        // Pick a random index
        var randomIndex = Math.floor(Math.random() * children.length);
        // Get the child at the random index
        var child = children.splice(randomIndex, 1)[0];
        // Append the child to the parent
        parent.appendChild(child);
        // If child node only contains text, then shuffle the text
        if (child.children.length === 0) {
          child.textContent = shuffleString(child.textContent);
        }
        // Recursively shuffle children's children
        shuffleChildren(child);
      }
    }
  }

  // Call the function with the body as the parent node
  shuffleChildren(document.body);

  // Define random x and y coordinates within the dimensions of the document
  var x = Math.floor(Math.random() * (document.body.scrollWidth + 1));
  var y = Math.floor(Math.random() * (document.body.scrollHeight + 1));

  // Scroll to the random positions
  window.scrollTo(x, y);
});

ipcRenderer.on("observer", (event, state, payload) => {
  switch (state) {
    case "screenshot-start":
      markPage();
      break;
    case "screenshot-end":
      unmarkPage();
      break;
  }
});

// DOM Labeler
let labels = [];

function unmarkPage() {
  for (const label of labels) {
    document.body.removeChild(label);
  }

  labels = [];
}

/** 标记页面元素 */
function markPage() {
  unmarkPage();

  var items = Array.prototype.slice
    // 遍历页面所有元素
    .call(document.querySelectorAll("*"))
    .map(function (element) {
      // 获取页面宽高度，只是窗口的宽高度不包括页面内容的滚动条
      var vw = Math.max(
        document.documentElement.clientWidth || 0,
        window.innerWidth || 0
      );
      var vh = Math.max(
        document.documentElement.clientHeight || 0,
        window.innerHeight || 0
      );
      // 获取元素自身的宽高度和相对窗口位置
      // const elementRect = element.getBoundingClientRect();
      // const rect = {
      //   left: Math.max(0, elementRect.left),
      //   top: Math.max(0, elementRect.top),
      //   right: Math.min(vw, elementRect.right),
      //   bottom: Math.min(vh, elementRect.bottom),
      // };
      // const calcRect = {
      //   ...rect,
      //   width: rect.right - rect.left,
      //   height: rect.bottom - rect.top,
      // };
      var rects = [...element.getClientRects()]
        // 过滤视口外部元素
        .filter((bb) => {
          // 计算元素中心点位置
          var center_x = bb.left + bb.width / 2;
          var center_y = bb.top + bb.height / 2;
          var elAtCenter = document.elementFromPoint(center_x, center_y);

          return elAtCenter === element || element.contains(elAtCenter);
        })
        // 处理元素位置、宽高
        .map((bb) => {
          const rect = {
            left: Math.max(0, bb.left),
            top: Math.max(0, bb.top),
            right: Math.min(vw, bb.right),
            bottom: Math.min(vh, bb.bottom),
          };
          return {
            ...rect,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
          };
        });

      // 计算元素面积
      // const area = calcRect.width * calcRect.height;
      var area = rects.reduce((acc, rect) => acc + rect.width * rect.height, 0);

      return {
        element: element,
        include:
          // 过滤出可操作的元素
          element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA" ||
          element.tagName === "SELECT" ||
          element.tagName === "BUTTON" ||
          element.tagName === "A" ||
          element.onclick != null ||
          window.getComputedStyle(element).cursor == "pointer" ||
          element.tagName === "IFRAME" ||
          element.tagName === "VIDEO",
        area,
        rects,
        text: element.textContent.trim().replace(/\s{2,}/g, " "),
      };
    })
    .filter((item) => item.include && item.area >= 20);
  // console.log("🚀 ~ markPage ~ items:", items);

  // 过滤svg元素的子元素 避免图标框选不完整图标
  items = items.filter((x) => x.element.parentElement.tagName !== "svg");
  // console.log("🚀 ~ filter svg children element ~ items:", items);

  // Only keep inner clickable items
  items = items.filter(
    (x) => !items.some((y) => x.element.contains(y.element) && !(x == y))
  );
  // console.log("🚀 ~ Only keep inner clickable items ~ items:", items);

  // Add random IDs
  // let idSet = new Set();
  items = items.map((item, index) => {
    // let id;
    // do {
    //   // generate unique id
    //   id = Math.floor(Math.random() * items.length * 10);
    // } while (idSet.has(id));
    // idSet.add(id);

    return {
      id: index,
      ...item,
    };
  });

  // Get ARIA and other representation information
  console.log("-- aria start --");
  items = items.map((item) => {
    let { id, element } = item;
    let { ariaDescription, ariaLabel } = element;

    let innerText = element.innerText;

    console.log(id, ariaDescription, ariaLabel, innerText);

    return {
      representation: ariaLabel,
      ...item,
    };
  });
  console.log("-- aria end --");

  // Lets create a floating border on top of these elements that will always be visible
  items.forEach(function (item, index) {
    // item.rects.forEach((bbox) => {
    let borderColor = `hsl(${parseInt(Math.random() * 360)}, 100%, 25%)`;
    let textColor = `white`;

    newElement = document.createElement("div");
    newElement.style.outline = `2px dashed ${borderColor}`;
    newElement.style.position = "fixed";
    newElement.style.left = item.rects[0].left + "px";
    newElement.style.top = item.rects[0].top + "px";
    newElement.style.width = item.rects[0].width + "px";
    newElement.style.height = item.rects[0].height + "px";
    newElement.style.pointerEvents = "none";
    newElement.style.boxSizing = "border-box";
    newElement.style.zIndex = 2147483647;
    // newElement.style.background = `${borderColor}80`;

    // Add floating label at the corner
    let label = document.createElement("span");
    label.textContent = item.id;
    label.style.position = "absolute";
    label.style.top = `-${Math.min(19, item.rects[0].top)}px`;
    label.style.left = "0px";
    label.style.background = borderColor;
    label.style.color = textColor;
    label.style.padding = "2px 4px";
    label.style.fontSize = "14px";
    label.style.fontFamily = "monospace";
    label.style.borderRadius = "2px";
    newElement.appendChild(label);

    document.body.appendChild(newElement);
    labels.push(newElement);
    // item.element.setAttribute("-ai-label", label.textContent);
    // });
  });

  // 同步元素数据到主进程用于操作元素
  ipcRenderer.send(
    "label-data",
    JSON.stringify(
      items.map((item) => {
        return {
          x: (item.rects[0].left + item.rects[0].right) / 2,
          y: (item.rects[0].top + item.rects[0].bottom) / 2,
          bboxs: item.rects.map(({ left, top, width, height }) => [
            left,
            top,
            width,
            height,
          ]),
          id: item.id,
        };
      })
    )
  );
}
