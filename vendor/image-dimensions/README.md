# Build image dimensions

This original MIT package replaces the `image-size` dependency used by the pinned Vinext 0.0.50 build. The root npm override installs this local package under that dependency name. It contains **none of the upstream parser implementation**. It supports the default and named `imageSize(Uint8Array)` exports used by Vinext's static-image and metadata-image dimension readers; it is not a general replacement for every upstream export or file-loading API.

Only PNG and GIF87a/GIF89a fixed-header dimensions are supported. JPEG, WebP, SVG, ICO/ICNS, JXL, HEIF/HEIC/AVIF, TIFF, and all other formats are rejected, including filesystem metadata images. The current TampaBayBot application has no imported or filesystem metadata image assets. Additions requiring another format need a separately reviewed implementation or an upstream parser with tested fixes.

Inputs must be `Uint8Array` values, at most 32 MiB. Dimensions must be positive, at most 100,000 per axis and 100,000,000 pixels in total. Parsing uses only fixed offsets, bounded signature comparisons, and buffer-view bounds. It never decodes pixels, scans chunks, follows offsets, or includes input content in errors. It reads dimensions, not full image validity: CRCs, image data, and later chunks are not validated.

Format references: [W3C PNG IHDR](https://www.w3.org/TR/png-3/#11IHDR), [GIF89a specification](https://www.w3.org/Graphics/GIF/spec-gif89a.txt). This implementation is original project code, not a renamed or copied upstream parser.

See `evaluation/security/REMEDIATION.md` for the advisory evidence and validation. Keep the override and local package together in source control. `npm ci --ignore-scripts` installs the replacement too; no mutation of installed dependency files or install-time patch is required.
