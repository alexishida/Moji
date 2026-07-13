## 1. Slice and stitch the capture

- [x] 1.1 Cap each capture at the device-pixel texture limit, deriving the slice height from the display scale factor
- [x] 1.2 Read back the scroll position actually reached and offset the capture rectangle, so a clamped final scroll does not duplicate a band
- [x] 1.3 Stitch the slice bitmaps into one image and encode it as PNG
- [x] 1.4 Hide scrollbars during PNG capture

## 2. Verification

- [x] 2.1 Run TypeScript typecheck
- [x] 2.2 Exercise the real `exportDocument` across document heights from 1500 to 60000 pixels, asserting exact image height and monotonic content (no duplicated slice)
- [ ] 2.3 Export PNG from the running app for the document that originally failed
