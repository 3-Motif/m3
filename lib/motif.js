const subgraphs = [
  new Set(["0,2", "1,0"]),
  new Set(["2,0", "0,1"]),
  new Set(["1,0", "0,1", "1,1"]),
  new Set(["2,1", "0,1", "1,1"]),
  new Set(["1,1", "1,0", "1,2"]),
  new Set(["2,2", "1,1"]),
  new Set(["0,2", "1,1", "2,0"]),
  new Set(["1,1"]),
  new Set(["0,2", "2,1"]),
  new Set(["2,0", "1,2"]),
  new Set(["1,2", "1,1", "2,1"]),
  new Set(["2,1", "1,2", "2,2"]),
  new Set(["2,2"]),
];

export function getSubgraphCount(A) {
  const adjList = createAdjList(A);
  const possibleSubgraphs = generatePossibleSubgraph(adjList);

  // console.log(possibleSubgraphs);

  const counts = new Array(subgraphs.length).fill(0);

  for (const label of possibleSubgraphs) {
    const [node1, node2, node3] = label.split(",").map(Number);
    // construct submatrix and calculate the degree Set
    const outDegrees = [
      A[node1][node2] + A[node1][node3],
      A[node2][node1] + A[node2][node3],
      A[node3][node1] + A[node3][node2],
    ];
    const inDegrees = [
      A[node2][node1] + A[node3][node1],
      A[node1][node2] + A[node3][node2],
      A[node1][node3] + A[node2][node3],
    ];

    const degrees = new Set([
      `${inDegrees[0]},${outDegrees[0]}`,
      `${inDegrees[1]},${outDegrees[1]}`,
      `${inDegrees[2]},${outDegrees[2]}`,
    ]);

    // check the degree of this subgraph with the known degrees all possible 3-node motifs
    for (let m = 0; m < subgraphs.length; m++) {
      if (
        degrees.size === subgraphs[m].size &&
        degrees.isSubsetOf(subgraphs[m])
      ) {
        counts[m] = counts[m] + 1;
      }
    }
  }
  return counts;
}

function createAdjList(A) {
  const n = A.length;
  const adjList = Array.from({ length: A.length }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (A[i][j] || A[j][i]) {
        // catching all the outgoing as well as incoming edges to be a neighbor to the vertex i
        adjList[i].push(j);
      }
    }
  }

  return adjList;
}

function generatePossibleSubgraph(adjList) {
  const possibleSubgraphs = new Set();

  for (let i = 0; i < adjList.length; i++) {
    for (let j = 0; j < adjList[i].length; j++) {
      const neighborNode = adjList[i][j];

      const neighbors1 = new Set(adjList[i]);
      const neighbors2 = new Set(adjList[neighborNode]);
      const possibleCandidateNode = neighbors1.union(neighbors2);
      possibleCandidateNode.delete(i);
      possibleCandidateNode.delete(neighborNode);

      for (const possibleNode of possibleCandidateNode) {
        const subgraphLabel = [i, neighborNode, possibleNode]
          .sort((a, b) => a - b)
          .join(",");
        possibleSubgraphs.add(subgraphLabel);
      }
    }
  }
  return possibleSubgraphs;
}
