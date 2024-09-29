const OpenAI = require("openai");

const EventEmitter = require("events");
const fs = require("node:fs/promises");
const path = require("path");
const fetch = require("node-fetch");

const prompt = (task, info) => `task: ${task}

type ClickAction = { action: "click", element: number }
type TypeAction = { action: "type", element: number, text: string }
type ScrollAction = { action: "scroll", direction: "up" | "down" }
type RequestInfoFromUser = { action: "request-info", prompt: string }
type RememberInfoFromSite = { action: "remember-info", info: string }
type Done = { action: "done" }

## response format
{
  thought: string,
  nextAction: ClickAction | TypeAction | ScrollAction | RequestInfoFromUser | RememberInfoFromSite | Done
}

## response examples
{
  "thought": "Typing 'funny cat videos' into the search bar"
  "nextAction": { "action": "type", "element": 11, "text": "funny cat videos" }
}
{
  "thought": "Today's doodle looks interesting, clicking it"
  "nextAction": { "action": "click", "element": 9 }
}
{
  "thought": "I have to login to create a post"
  "nextAction": { "action": "request-info", "prompt": "What is your login information?" }
}
{
  "thought": "Today's doodle is about Henrietta Lacks, remembering that for our blog post"
  "nextAction": { "action": "remember-info", "info": "Today's doodle is about Henrietta Lacks" }
}

## stored info
${JSON.stringify(info)}

## instructions
# observe the screenshot, and think about the next action
# output your response in a json markdown code block
# if the next action in response is "remember-info", you should output the info in a json markdown code block and change the next action to "done"
`;

process.env.OPENAI_API_KEY =
  "Bearer sk-iO9qUq7zCj5bA2hP1s8mFGkU4nJd3T7vJfHqG9wE6t3yZvG";
process.env.OPENAI_BASE_URL = "http://172.168.203.74:33333/v1/chat/completions";

class OpenAIChatController extends EventEmitter {
  async initialize() {
    console.log(__dirname);

    let apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      try {
        apiKey = await fs.readFile(
          path.join(__dirname, "../keys/openai.txt"),
          "utf8"
        );
      } catch (error) {
        console.error("Failed to read API key from file:", error);
      }
    }

    if (!apiKey) {
      throw new Error(
        "OpenAI API key not found in environment variable or file"
      );
    }

    this.openai = new OpenAI({ apiKey });
  }

  async uploadImageData(imageData) {
    this.rawImage = imageData;
    this.lastImage = `data:image/png;base64,${imageData.toString("base64")}`;
  }

  async send(text) {
    let userPrompt = prompt(text, []);

    let ep = Date.now();
    console.log("Episode #" + ep);
    await fs.writeFile("tmp/screenshot_" + ep + ".png", this.rawImage);

    await fs.writeFile("tmp/prompt_" + ep + ".txt", userPrompt);
    // await fs.writeFile("tmp/image_" + ep + ".txt", this.lastImage);

    // const { choices } = await this.openai.chat.completions.create({
    //   messages: [
    //     {
    //       role: "user",
    //       content: [
    //         { type: "text", text: userPrompt },
    //         {
    //           type: "image_url",
    //           image_url: {
    //             url: this.lastImage,
    //             // detail: "high"
    //           },
    //         },
    //       ],
    //     },
    //   ],
    //   max_tokens: 500,
    //   model: "gpt-4-vision-preview",
    // });
    const url = "http://172.168.203.74:33333/v1/chat/completions";
    const headers = {
      Authorization:
        "Bearer sk-iO9qUq7zCj5bA2hP1s8mFGkU4nJd3T7vJfHqG9wE6t3yZvG",
      "Content-Type": "application/json",
    };

    const data = {
      model: "gpt-4o",
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: { url: this.lastImage, detail: "high" },
            },
          ],
        },
      ],
      temperature: 0.8,
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      // this.emit("message", response);
      await fs.writeFile(
        "tmp/response_" + ep + ".txt",
        JSON.stringify(responseData)
      );

      const result = responseData.choices[0].message.content;
      await fs.writeFile("tmp/result_" + ep + ".txt", result);
      this.emit("end_turn", result);
    } catch (error) {
      console.error("Error calling GPT-4 API:", error);
    }
  }
}

module.exports = OpenAIChatController;
