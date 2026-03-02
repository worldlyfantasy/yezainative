function parseIdeaBody(body) {
  if (!body) {
    return [];
  }

  return body.split("\n\n").map((block, index) => {
    if (block.indexOf("###") === 0) {
      return {
        id: `block-${index}`,
        type: "heading",
        content: block.replace("###", "").trim()
      };
    }

    if (block.indexOf(">") === 0) {
      return {
        id: `block-${index}`,
        type: "quote",
        content: block.replace(">", "").trim()
      };
    }

    return {
      id: `block-${index}`,
      type: "paragraph",
      content: block.trim()
    };
  });
}

module.exports = {
  parseIdeaBody
};
