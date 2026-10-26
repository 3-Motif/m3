import { generateAdjacencyMatrix } from "./lib/matrix.js";
import { ForceDirectedGraph } from "./lib/network.js";

const fileUploadDialog = document.getElementById("fileUploadDialog");
const fileInfoDialog = document.getElementById("fileInfoDialog");
const countSubgraphBtn = document.getElementById("countSubgraphBtn")
const spinner = document.getElementById("loader");
const subgraphWindow = document.getElementById("subgraphWindow");

fileInfoDialog.style.display = "none";
subgraphWindow.style.display = "none";
spinner.style.display = "none";
graphCanvasSection.style.display = 'none';
resetVizBtn.style.display = 'none';

let A;
let motifList;
let networkViz;

// on upload network file
document.getElementById("upload").addEventListener("change", async (event) => {
  spinner.style.display = "flex";
  const file = event.target.files[0];
  if (!file) return;
  // Read file as text
  const text = await file.text();
  const result = generateAdjacencyMatrix(text);
  A = result[0];

  document.getElementById("fileName").innerText = file.name
  document.getElementById("nodeCount").innerText = `Nodes: ${result[1]}`
  document.getElementById("edgeCount").innerText = `Edges: ${result[2]}`

  // console.log(A)

  graphCanvasSection.style.display = 'flex'
  networkViz = new ForceDirectedGraph(graphCanvas, A);
  networkViz.showAllNodes();
  resetVizBtn.addEventListener('click', (e) => {
    document.querySelectorAll('.subgraph').forEach(el=>el.classList.remove('selected'));
    networkViz.showAllNodes();
    resetVizBtn.style.display = 'none';
  })


  spinner.style.display = "none";
  fileUploadDialog.style.display = "none";
  fileInfoDialog.style.display = "block";

  closeGraph.addEventListener('click', (event)=>{
    // reset everything
    graphCanvasSection.style.display = "none";
    fileInfoDialog.style.display = "none";
    subgraphWindow.style.display = "none";
    fileUploadDialog.style.display = "flex";
    countSubgraphBtn.disabled = false;
    networkViz.destroy();
  })
});

countSubgraphBtn.addEventListener("click", (event) => {
  // create worker thread for the computation of subgraph enumeration
  const worker = new Worker("./lib/motifWorker.js", {
    type: "module"
  });

  countSubgraphBtn.disabled = true;
  spinner.style.display = "flex";

  worker.postMessage(A);

  worker.onmessage = ({ data }) => {
    spinner.style.display = "none";

    if (data.success) {
      subgraphWindow.style.display = "block";
      const counts = data.motifCounts;
      motifList = data.motifList;

      counts.forEach((count, index) => {
        // console.log(count)
        const subgraphDiv = document.getElementById(`subgraph${index}`);
        subgraphDiv.querySelector('#subgraphCount').innerText = `Count: ${count}`
      })

    } else {

      console.error(data.error);

    }

    worker.terminate();
  }
})

document.querySelector('.subgraphs').addEventListener('click', (event)=>{
  const subgraphEl = event.target.closest('.subgraph');

  if (subgraphEl) {
    // show selected style
    document.querySelectorAll('.subgraph').forEach(el=>el.classList.remove('selected'))
    subgraphEl.classList.add('selected');

    // get the id of the selected motif
    const motifNo = parseInt(subgraphEl.id.replace('subgraph', ''), 10);

    if(motifList[motifNo].length < 1) return;

    const nodesToShow = [];
    motifList[motifNo].forEach((label) => {
      const nodes = label.split(",").map(Number);
      nodesToShow.push(...nodes);
    })
    networkViz.showOnlyNodes(nodesToShow);
    resetVizBtn.style.display = 'block';
  }
})

