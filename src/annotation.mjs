// htmlreview — W3C Annotation envelope 빌더 (Node 환경)
//
// design.md §3.1 의 Annotation 루트 + §3.2 Target 을 그대로 따른다.

import { randomUUID, createHash } from "node:crypto";

const ANNO_URN_PREFIX = "urn:htmlreview:annotation:";
const DOC_URN_PREFIX = "urn:htmlreview:doc:";
const CONTEXT_URL = "http://www.w3.org/ns/anno.jsonld";

export const computeSourceUrn = (sourceContent) => {
  const hash = createHash("sha256").update(sourceContent).digest("hex").slice(0, 16);
  return `${DOC_URN_PREFIX}${hash}`;
};

const inferImageFormat = (dataUrl) => {
  const match = typeof dataUrl === "string" ? dataUrl.match(/^data:([^;,]+)[;,]/) : null;
  return match ? match[1] : "image/png";
};

const buildBody = (commentText, images) => {
  const body = [];
  if (typeof commentText === "string" && commentText.trim().length > 0) {
    body.push({
      type: "TextualBody",
      value: commentText,
      format: "text/plain",
      purpose: "commenting",
    });
  }
  for (const dataUrl of images) {
    body.push({
      type: "Image",
      format: inferImageFormat(dataUrl),
      value: dataUrl,
    });
  }
  return body;
};

export const buildAnnotation = ({
  selector,
  commentText,
  images = [],
  sourceUrn,
  format,
  motivation = "commenting",
}) => {
  if (!selector) throw new Error("buildAnnotation requires a selector");
  if (!sourceUrn) throw new Error("buildAnnotation requires sourceUrn");
  return {
    "@context": CONTEXT_URL,
    id: `${ANNO_URN_PREFIX}${randomUUID()}`,
    type: "Annotation",
    motivation,
    created: new Date().toISOString(),
    body: buildBody(commentText, images),
    target: {
      source: sourceUrn,
      ...(format ? { format } : {}),
      selector,
    },
  };
};
