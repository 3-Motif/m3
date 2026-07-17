import { generateAdjacencyMatrix } from "./lib/matrix.js";

const fileUploadDialog = document.getElementById("fileUploadDialog");
const fileInfoDialog = document.getElementById("fileInfoDialog");
const countSubgraphBtn = document.getElementById("countSubgraphBtn")
const spinner = document.getElementById("loader");
const subgraphWindow = document.getElementById("subgraphWindow");

fileInfoDialog.style.display = "none";
subgraphWindow.style.display = "none";
spinner.style.display = "none";

let A;

// on upload network file
document.getElementById("upload").addEventListener("change", async (event) => {
  spinner.style.display = "flex";
  const file = event.target.files[0];
  if (!file) return;
  // Read file as text
  const text = await file.text();
  const result = generateAdjacencyMatrix(text);
  A = result[0]

  document.getElementById("fileName").innerText = file.name
  document.getElementById("nodeCount").innerText = `Nodes: ${result[1]}`
  document.getElementById("edgeCount").innerText = `Edges: ${result[2]}`

  // console.log(A)

  spinner.style.display = "none";
  fileUploadDialog.style.display = "none";
  fileInfoDialog.style.display = "block";
});

countSubgraphBtn.addEventListener("click", (event) => {
  // create worker thread for the computation of subgraph enumeration
  const worker = new Worker("./lib/motifWorker.js", {
    type: "module"
  });

  countSubgraphBtn.disabled = true
  spinner.style.display = "flex";

  worker.postMessage(A);

  worker.onmessage = ({ data }) => {
    spinner.style.display = "none";

    if (data.success) {
      subgraphWindow.style.display = "block"
      const counts = data.result
      counts.forEach((count, index) => {
        // console.log(count)
        const subgraphDiv = document.getElementById(`subgraph${index}`)
        subgraphDiv.querySelector('#subgraphCount').innerText = `Count: ${count}`
      })

    } else {

      console.error(data.error);

    }

    worker.terminate();


  }
})
