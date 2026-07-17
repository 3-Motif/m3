import { getSubgraphCount } from "./motif.js";

self.onmessage = ({ data }) => {

  try {
    const result = getSubgraphCount(data);

    self.postMessage({
      success: true,
      result
    });

  }
  catch (err) {

    self.postMessage({
      success: false,
      error: err.message
    });

  }

};