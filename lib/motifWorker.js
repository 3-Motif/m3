import { getSubgraphCount } from "./motif.js";

self.onmessage = ({ data }) => {

  try {
    const { motifCounts, motifList } = getSubgraphCount(data);

    self.postMessage({
      success: true,
      motifCounts,
      motifList
    });

  }
  catch (err) {

    self.postMessage({
      success: false,
      error: err.message
    });

  }

};