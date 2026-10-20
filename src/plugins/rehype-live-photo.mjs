function visit(node, parent) {
	if (!node || typeof node !== "object") return;
	if (node.type === "element" && node.tagName === "img") {
		const properties = node.properties || {};
		const title = String(properties.title || "");
		const match = title.match(/^live-photo[=:](https?:\/\/\S+)$/i);
		if (match && parent?.children) {
			const image = { ...node, properties: { ...properties } };
			delete image.properties.title;
			parent.children[parent.children.indexOf(node)] = {
				type: "element",
				tagName: "live-photo",
				properties: { dataVideoUrl: match[1] },
				children: [image],
			};
			return;
		}
	}
	if (Array.isArray(node.children)) {
		for (const child of [...node.children]) visit(child, node);
	}
}

export default function rehypeLivePhoto() {
	return (tree) => visit(tree, null);
}
