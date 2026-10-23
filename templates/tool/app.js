import { copy } from "/assets/app.js";
import { message } from "/assets/lib/dom.js";
import { process } from "/{{SLUG}}/core.js";

const input = document.getElementById("input");
const output = document.getElementById("output");
const msgBox = document.getElementById("msg");

document.getElementById("run").addEventListener("click", () => {
  if (!input.value) {
    message(msgBox, "输入为空", "err");
    return;
  }
  try {
    output.textContent = process(input.value);
    message(msgBox, "完成", "ok");
  } catch (err) {
    message(msgBox, err.message, "err");
  }
});

document.getElementById("copy").addEventListener("click", () => {
  if (!output.textContent) return;
  copy(output.textContent);
});

document.getElementById("clear").addEventListener("click", () => {
  input.value = "";
  output.textContent = "";
  message(msgBox, "", "ok");
});

input.focus();
