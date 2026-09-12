export interface ImageDimensions {
  width: number;
  height: number;
  type: "png" | "gif";
}

export declare function imageSize(input: Uint8Array): ImageDimensions;
export default imageSize;
