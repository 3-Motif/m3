// parse network file and create adjacency matrix
// return Matrix, nodesCount, EdgeCount
export function generateAdjacencyMatrix(data) {
  const edges = [];
  let maxIndex = 0;

  const lines = data.trim().split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const [u, v] = line.trim().split(/\s+/).map(Number);

    // Convert from 1-based to 0-based indexing
    const row = u - 1;
    const col = v - 1;

    edges.push([row, col]);

    maxIndex = Math.max(maxIndex, row, col);
  }

  // Create an N x N matrix of zeros
  const N = maxIndex + 1;

  const matrix = Array.from({ length: N }, () => Array(N).fill(0));

  // Fill the matrix
  for (const [row, col] of edges) {
    matrix[row][col] = 1;
  }

  return [matrix, maxIndex, edges.length];
}
