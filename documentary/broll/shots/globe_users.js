// globe_users: "The model improves. More people come." / "A race for users."
// A dark planet drawn as a dotted data globe: land dots from a hand-encoded coastline mask (rasterised at runtime
// to an equirectangular 720x360 bitmap), thousands of warm user lights appearing over the populated regions, arcs
// of light from cities streaming toward one bright hub, cold atmosphere on the limb. Camera: slow orbit and push.
//
// opts
//   growFrom  0..1 of shot progress when the first user lights appear (default 0.05)
//   growTo    0..1 of shot progress when all user lights are on (default 0.9)
//   arcs      true/false: draw the arcs streaming toward the hub (default true)
//   seed      layout seed for users and arcs (default 4)
import { THREE, register, rng, noise, ease, prog, clamp, lerp, glowTexture } from '../kit.js';

// ---------------- coastline polygons, [lon, lat] degrees ----------------
export const LAND = [
  // North America
  [[-168, 65.6], [-163, 67], [-166, 68.9], [-162, 70.2], [-156, 71.3], [-150, 70.4], [-141, 69.7], [-134, 69.5], [-128, 70.1], [-120, 69], [-114, 68.4], [-108, 68.2], [-101, 67.8], [-96, 68.5], [-94, 71.5], [-90, 68.6], [-85, 69.6], [-82, 68.5], [-81, 66.8], [-86, 66.2], [-88, 64.2], [-91, 62.8], [-94, 61], [-93, 58.5], [-88.5, 56.6], [-85, 55.3], [-82, 55], [-79.5, 52], [-79, 54.7], [-77, 57.5], [-78, 60.5], [-77.5, 62.5], [-73, 62.2], [-70, 61], [-67, 58.5], [-64, 59.8], [-61.5, 56.3], [-58, 54.5], [-56, 52], [-59.5, 50.3], [-66, 50.1], [-70, 47.3], [-66, 49.2], [-64.6, 48.6], [-65, 47], [-61, 46], [-60, 45.6], [-66, 44.5], [-67, 44.7], [-70, 43.6], [-70.5, 41.8], [-74, 40.5], [-75.5, 38.2], [-76.2, 35.6], [-78, 33.8], [-81, 31.6], [-81.3, 29.5], [-80.1, 26], [-80.6, 25.2], [-81.7, 25.9], [-82.8, 28], [-83.6, 29.9], [-85.5, 29.9], [-89, 30.3], [-89.5, 29.1], [-91.5, 29.5], [-94, 29.6], [-97.2, 27.7], [-97.6, 25], [-97.8, 22.5], [-97.2, 20.8], [-96, 19], [-94.5, 18.2], [-91.5, 18.6], [-90.4, 21], [-87, 21.5], [-87.6, 18.4], [-88.4, 16], [-86, 15.9], [-83.2, 15], [-83.7, 11], [-81.5, 8.8], [-79.5, 9.6], [-77.4, 8.6], [-78.2, 7.4], [-80.2, 7.3], [-80.6, 8.1], [-83.7, 8.5], [-85.8, 10.4], [-86.3, 12.2], [-87.6, 13.1], [-91.3, 13.9], [-94.3, 16.1], [-96.5, 15.7], [-101, 17.2], [-105.5, 20.1], [-105.3, 21.8], [-106.5, 23.3], [-108.5, 25.4], [-111, 27.9], [-112.8, 30.6], [-114.7, 31.7], [-113.2, 29.5], [-112, 27.5], [-110.5, 24.6], [-109.5, 23.1], [-110.4, 23.5], [-112.2, 24.9], [-114.2, 27.6], [-115.8, 30.3], [-117.1, 32.5], [-118.5, 34], [-120.6, 34.6], [-121.9, 36.6], [-122.5, 37.8], [-123.8, 39.8], [-124.3, 42], [-124, 46.2], [-124.7, 48.4], [-123.2, 49.1], [-125.3, 50.3], [-127.8, 51.5], [-130.3, 54.5], [-133, 57.3], [-136.5, 58.6], [-140, 59.8], [-144, 60.1], [-147, 60.9], [-150.5, 59.4], [-152, 60.6], [-154, 59.3], [-154, 57.6], [-157, 57.5], [-158.6, 56.5], [-163.5, 54.8], [-160.5, 57.8], [-162, 59.9], [-165, 62.5], [-161, 64.5], [-166, 64.6]],
  // Greenland and the Canadian Arctic
  [[-72, 78.5], [-60, 82], [-40, 83.5], [-22, 82.5], [-18, 80], [-19.5, 76], [-21.5, 71], [-24, 69.5], [-30, 68.3], [-35, 66], [-40, 65], [-43, 60], [-48, 61], [-51, 64], [-53.5, 67], [-54.5, 70.5], [-56, 73.3], [-61, 76], [-66.5, 76.5]],
  [[-80, 73.7], [-70, 71], [-62, 66.5], [-66, 62.5], [-72, 63.5], [-78, 65.5], [-82, 68.5], [-88, 70.5], [-85, 73.3]],
  [[-80, 77], [-75, 79], [-62, 82], [-70, 83], [-85, 82.5], [-92, 80.5], [-89, 78.5]],
  [[-118, 72], [-110, 73], [-102, 72.8], [-101, 70], [-106, 69], [-115, 69], [-119, 70.5]],
  [[-125, 72], [-120, 74.3], [-116, 73.5], [-119, 71.5]],
  [[-92, 76.5], [-80, 76.5], [-80, 74.6], [-92, 74.6]],
  [[-100, 76.5], [-94, 75.5], [-98, 73], [-104, 73], [-106, 75.5]],
  // Caribbean
  [[-84.9, 21.9], [-82.5, 23.2], [-80.5, 23.1], [-77.5, 21.8], [-74.2, 20.2], [-77.7, 19.8], [-80, 21.7], [-82, 22.3]],
  [[-74.4, 18.5], [-72.8, 19.9], [-70, 19.7], [-68.4, 18.6], [-71, 18], [-72.6, 18.2]],
  // South America
  [[-77.4, 8.6], [-75.5, 10.5], [-73, 11.3], [-71.5, 12.3], [-70, 11.6], [-68, 10.6], [-64, 10.6], [-61.5, 10.6], [-60, 8.5], [-57, 6], [-53.5, 5.5], [-51.5, 4], [-50, 1.8], [-50, 0], [-48.5, -1], [-44.5, -2.5], [-41, -2.9], [-38.5, -3.7], [-35.3, -5.2], [-34.8, -7.5], [-35.3, -9.5], [-37, -11], [-38.8, -13], [-39, -17.5], [-40.5, -20.5], [-41.8, -22.8], [-44.5, -23.2], [-48, -25.5], [-48.6, -28.3], [-50.5, -31], [-52.5, -33.5], [-54, -34.8], [-56, -34.9], [-58.4, -34.2], [-57.3, -36.2], [-57.6, -38.2], [-62, -39], [-62.3, -40.8], [-65, -41], [-63.7, -42.8], [-65.3, -44.5], [-67.5, -46.3], [-65.8, -47.8], [-68.2, -50.2], [-69, -51.6], [-68.4, -52.4], [-66.5, -55], [-68, -55.6], [-71, -54.5], [-74.5, -52.5], [-75.5, -48.5], [-74, -45], [-73.5, -42], [-73.7, -38], [-72.6, -35], [-71.5, -32], [-71.4, -28], [-70.4, -23.5], [-70.2, -18.5], [-71.5, -17.2], [-75.2, -15.4], [-76.4, -13.5], [-78.2, -10], [-79.6, -7.5], [-81.2, -6], [-80.3, -3.4], [-80.9, -1], [-80, 0.5], [-78.8, 1.8], [-77.4, 4], [-77.3, 6.8], [-77.9, 7.3]],
  // Africa
  [[-6, 35.8], [-9.2, 32.5], [-9.8, 30], [-13, 27.6], [-15, 24.5], [-17, 21], [-16.3, 19], [-16.5, 16], [-17.5, 14.7], [-16.7, 12.5], [-15, 11], [-13.5, 9.5], [-12, 7.3], [-9, 5], [-7.5, 4.4], [-4, 5.2], [-1.5, 5], [1.5, 6.2], [4.5, 6.3], [6, 4.3], [8.5, 4.6], [9.6, 3.5], [9.8, 1], [9.3, -1], [11.8, -4.5], [12.3, -6], [13.2, -9], [12.4, -13.5], [11.8, -17], [14.5, -22.9], [15.3, -27], [16.5, -28.6], [18.2, -32.5], [18.4, -34.1], [20, -34.8], [22.5, -34], [25.6, -33.9], [28, -32.5], [30.5, -30.5], [32.4, -28.5], [32.9, -26], [35.5, -24], [35.4, -21.5], [34.7, -19.8], [37, -17.5], [40.5, -15], [40.5, -10.5], [39.3, -7], [39.5, -5], [40.2, -3], [41.7, -1.5], [43.5, 0.9], [46, 2.5], [48.7, 5.5], [51.2, 10.5], [51.3, 11.8], [48.5, 11.2], [45, 10.5], [43.4, 11.6], [42.8, 12.6], [41, 14.5], [39.5, 15.8], [38.6, 17.8], [37.4, 21], [36.8, 22], [35.6, 23.9], [34, 26.7], [32.6, 29.9], [32.3, 31.2], [30, 31.4], [29, 30.9], [25, 31.6], [23, 32.6], [20, 30.9], [19.5, 30.3], [15.5, 31.5], [11.5, 33.2], [10.5, 36.8], [11, 37], [9.5, 37.3], [3, 36.8], [-1, 35.6], [-2.5, 35.2], [-5.5, 35.9]],
  [[32.3, 31.2], [34.2, 31.3], [34.9, 29.5], [34.3, 27.8], [32.6, 29.9]],
  [[49.3, -12], [50.4, -15.5], [49.6, -18.5], [48.5, -21.5], [47.1, -24.8], [45.2, -25.6], [43.6, -23.5], [43.3, -21.8], [44.4, -19.5], [44, -17], [46.4, -15.6], [48, -13.5]],
  // Eurasia
  [[-5.6, 36], [-2, 36.7], [0.2, 38.7], [-0.3, 39.5], [0.9, 41], [3.2, 41.9], [3.1, 43.1], [5, 43.4], [7.5, 43.8], [8.8, 44.4], [10.5, 42.9], [12.5, 41.6], [15.6, 40], [15.7, 38], [16.6, 38.5], [17.2, 39.4], [18.5, 40.1], [17, 41], [14, 42.5], [12.4, 44.3], [12.3, 45.3], [13.7, 45.6], [15, 44.5], [17, 43], [19.5, 42], [19.4, 40.5], [21, 38.5], [21.5, 37], [23, 36.5], [23.5, 38], [22.6, 39.5], [24, 40.8], [26, 40.7], [26.2, 39.5], [26.5, 38.4], [27.5, 37], [29, 36.7], [30.5, 36.3], [32, 36.3], [34.5, 36.8], [36, 36.7], [35.8, 35], [35.5, 34], [34.9, 32.5], [34.2, 31.3], [34.9, 29.5], [35.5, 28], [37, 25.5], [39, 22], [40.5, 19.5], [42.5, 16.5], [43.3, 12.8], [45, 12.8], [48.5, 14], [52, 15.8], [55, 17.5], [57, 18.9], [58.6, 20.5], [59.8, 22.5], [58.6, 23.6], [56.3, 26], [56, 24.8], [54, 24.1], [51.5, 24.5], [51.3, 26], [50, 26.5], [48.5, 28.5], [48, 30], [49.5, 30], [50.5, 29], [51.5, 27.8], [54.5, 26.6], [56.5, 27.1], [57.3, 25.8], [61.5, 25.2], [66.5, 25.4], [68, 23.7], [69, 22.4], [70, 21], [72.6, 21.3], [72.8, 19], [73.5, 16], [74.8, 12.8], [76.3, 9.5], [77.5, 8.1], [78.2, 8.9], [79.8, 10.3], [80.3, 13.5], [80.2, 15.8], [82.3, 16.6], [85, 19.5], [86.9, 21.4], [88.5, 21.8], [90.5, 22.5], [91.8, 22.4], [92.3, 20.7], [94.3, 18.5], [94.5, 16], [95.4, 15.8], [97.6, 16.5], [98.5, 13.5], [98.3, 10], [98.5, 8], [100.3, 6], [100.4, 4], [101.3, 2.8], [103.4, 1.3], [104.2, 1.4], [103.4, 4.2], [102.3, 6.2], [100.4, 7.3], [99.8, 9.3], [100, 12.6], [100.5, 13.5], [101, 12.7], [102.5, 12], [103, 11], [104.5, 10.5], [105, 8.6], [106.7, 10.4], [109.2, 11.6], [109.3, 13.5], [108.8, 15.5], [106.6, 17.5], [105.7, 19], [106.7, 20.7], [108, 21.5], [109.8, 21.5], [110.2, 20.3], [111, 21.5], [113.5, 22.2], [116.5, 23], [118.5, 24.5], [119.6, 26], [121, 28], [122, 30], [121.8, 31.5], [120.5, 33], [119.3, 35], [120.5, 36.1], [122.5, 37.3], [120.5, 37.7], [118.9, 37.4], [117.7, 38.8], [119.3, 39.5], [121.2, 40.9], [121.6, 39], [122.3, 40], [124.3, 39.9], [125.2, 37.7], [126.5, 37.1], [126.3, 34.6], [127.5, 34.6], [129.3, 35.4], [129.4, 36.9], [128.4, 38.5], [127.5, 39.8], [129.7, 41], [130.6, 42.4], [132.5, 43.2], [135.5, 44], [138.5, 47], [140.3, 48.9], [140.8, 51.5], [141.4, 53.3], [137.5, 54.1], [135.2, 54.9], [138.5, 56.5], [141, 58.5], [143.5, 59.4], [148, 59.4], [152, 59], [155, 59.3], [156, 57.5], [156.5, 51.2], [158.6, 52.9], [161.8, 55], [163.2, 56.2], [162.3, 58], [164.5, 59.8], [166, 60.3], [170.3, 60], [172.5, 61], [177.5, 62.5], [179.99, 64.8], [179.99, 69], [176, 69.8], [170, 70.1], [161, 69.6], [159.7, 70.8], [152, 70.9], [146, 72.3], [140, 72.5], [135, 71.6], [130, 70.9], [128.8, 72.9], [126.5, 72.4], [122, 73], [113.5, 73.6], [110, 74], [112, 76.5], [104, 77.7], [98, 76.4], [93, 75.9], [88, 75.1], [86.5, 74], [80.5, 73.6], [80.5, 72.2], [78, 72.4], [75, 72.8], [73.5, 68.5], [72.8, 66.5], [69.5, 66.7], [68.5, 68.2], [66.8, 69.5], [61, 69.8], [59, 68.4], [55, 68.4], [53.5, 68.8], [49, 67.8], [44.2, 66.2], [44, 68.5], [39, 68.2], [33, 69.4], [28.5, 70.9], [25.8, 71.1], [21, 70.2], [16.5, 68.5], [13.5, 67.5], [12.5, 65.5], [10.5, 64.3], [8.3, 63.3], [5, 62], [5, 60], [5.5, 58.8], [7, 58], [8.2, 58.1], [10.5, 59.3], [11.2, 58.9], [11.8, 58], [12.7, 56.2], [14.3, 55.5], [16.4, 56.7], [18.5, 59.4], [17.2, 61.7], [17.8, 63], [20.5, 63.8], [22.5, 65.8], [24.5, 65.8], [25.4, 64.9], [21.5, 62.5], [21.3, 60.8], [23, 59.9], [26, 60.4], [28.6, 60.6], [30.2, 59.9], [28, 59.5], [23.4, 59.1], [23.5, 58.3], [24.4, 57.4], [24.1, 57], [21.6, 57.3], [21, 56], [21.2, 55.2], [19.6, 54.4], [18.5, 54.8], [16, 54.3], [14, 53.9], [12, 54.2], [10.2, 54.4], [10.9, 56.4], [10.5, 57.6], [8.6, 57.1], [8.1, 55.5], [8.6, 54.9], [8.9, 54], [7, 53.5], [5, 53.3], [4.5, 52.3], [3.5, 51.4], [1.8, 51], [1.6, 50.2], [0.2, 49.6], [-1.3, 49.7], [-1.9, 48.7], [-4.7, 48.4], [-2.4, 47.2], [-1.2, 46.2], [-1.5, 44.5], [-1.8, 43.4], [-3.8, 43.5], [-8, 43.7], [-9.3, 43], [-8.8, 42], [-8.9, 40.2], [-9.5, 38.8], [-8.8, 37.9], [-9, 37], [-7.4, 37.2], [-6.3, 36.6]],
  // Chukotka beyond the date line
  [[-180, 64.8], [-178, 64.5], [-175, 64.8], [-172.5, 64.4], [-170, 66], [-175, 67.5], [-180, 69]],
  // European islands
  [[-5.7, 50.1], [-3, 50.6], [1.4, 51.2], [1.7, 52.7], [0.3, 53.4], [-0.2, 54.1], [-1.6, 55.6], [-2.1, 57.1], [-1.8, 57.6], [-3.3, 58.6], [-5, 58.6], [-5.8, 57.8], [-5.6, 56.3], [-4.9, 55.5], [-5, 54.8], [-3.4, 54.9], [-3, 53.8], [-3.1, 53.3], [-4.6, 53.3], [-4.2, 52.3], [-5.2, 51.8], [-3.4, 51.4], [-4.2, 51.2]],
  [[-6, 52.2], [-6.2, 53.9], [-5.5, 54.6], [-7, 55.3], [-8.5, 54.9], [-10, 54.2], [-9.8, 53.4], [-10.4, 52.2], [-9.6, 51.6], [-8, 51.7]],
  [[-22, 64], [-24, 65.5], [-22.5, 66.4], [-16, 66.5], [-14.5, 65.5], [-13.6, 65], [-15, 64.3], [-18.5, 63.4]],
  [[11, 78.5], [16, 80], [22, 80.3], [27, 79.5], [21, 78], [17, 76.6], [14, 77.5]],
  [[52, 71.5], [55, 73.5], [58, 75.5], [65, 76.8], [68.5, 76.5], [61, 74.5], [57.5, 72.8], [55.5, 70.6]],
  [[8.5, 41], [9.6, 41], [9.6, 39.2], [8.4, 39]], [[12.4, 38.1], [15.6, 38.3], [15.1, 36.7]],
  // East and South-East Asia islands
  [[129.7, 33.2], [130.9, 34], [131.9, 33.3], [131.4, 31.4], [130.2, 31.2], [129.8, 32.6]],
  [[132.5, 33.3], [133.7, 34.3], [134.7, 34.2], [134.2, 33.2], [133, 32.7]],
  [[130.9, 34], [132.5, 35.4], [135.5, 35.6], [136.9, 37.2], [138.5, 37.4], [139.9, 38.8], [140, 40.5], [140.8, 41.5], [141.5, 40.6], [142, 39.5], [141, 37.5], [140.8, 35.8], [140, 35], [139, 34.7], [137, 34.6], [136, 33.5], [135, 34], [133, 34.4], [131.5, 34]],
  [[140, 41.5], [139.9, 42.8], [141.5, 45.4], [142.5, 44.5], [145.3, 44.3], [145.5, 43.2], [143.8, 42.1], [141, 41.8]],
  [[142, 46], [143.5, 46.5], [143, 49.5], [144.5, 49.2], [143, 54.2], [142.3, 54], [141.8, 51.5], [142.1, 47.5]],
  [[120.2, 22.6], [120.8, 21.9], [121.9, 24.5], [121.5, 25.3], [120.6, 24.5]],
  [[108.7, 19.2], [110.2, 20.1], [111, 19.6], [110, 18.2], [109, 18.4]],
  [[79.8, 6.5], [79.9, 9.8], [80.3, 9.8], [81.9, 7.5], [81.3, 6.2], [80.2, 6]],
  [[120, 18.5], [122.3, 18.4], [121.6, 15.5], [124, 13], [123.5, 12.6], [120.6, 13.8], [120, 16]],
  [[122, 7], [123.5, 8.7], [126.5, 9.2], [126.2, 6.3], [125, 5.6], [124, 6.5]],
  [[122, 10.5], [124, 12], [125.5, 11.2], [124.5, 9.8], [123, 9.5]],
  [[95.3, 5.6], [97.5, 5.2], [100.3, 2.5], [103.8, -1], [106, -3.2], [105.8, -5.8], [104.5, -5.8], [101.5, -3], [100, -1], [98.7, 1.7], [96, 3.8]],
  [[105.2, -6.8], [106.8, -6], [108.3, -6.3], [110.5, -6.9], [112.7, -6.9], [114.4, -7.7], [114.5, -8.7], [111, -8.2], [108.5, -7.8], [106.5, -7.4]],
  [[109, 1.5], [109.6, 2], [111, 1.7], [113.4, 3.5], [115.5, 5.2], [116.9, 7], [119.2, 5.2], [118, 4.3], [118.5, 1], [117.5, 0], [116.5, -1.5], [116.3, -3.6], [114.5, -4.1], [111.8, -3.5], [110.2, -2.9], [109.5, -0.5]],
  [[119.4, -5.5], [120.4, -5.6], [120.5, -2.8], [121.3, -1], [123.3, -0.9], [124.9, 1.5], [120.8, 1.2], [119.8, 0], [118.8, -2.8]],
  [[131, -1.4], [134.2, -0.9], [135.5, -3.3], [138, -1.6], [141, -2.6], [144.5, -3.9], [146, -5.5], [147.8, -6.3], [147.5, -8], [150.5, -10.3], [148, -10.2], [146, -8.1], [144, -7.7], [141, -9.1], [138.5, -8.3], [137.8, -5.4], [135, -4.4], [132.8, -4], [132, -2.9]],
  [[124, -9.3], [127, -8.4], [125, -10]],
  // Australia and New Zealand
  [[113.6, -22], [114.2, -26.5], [115, -30], [115.7, -33.4], [115, -34.3], [117.9, -35.1], [120, -33.9], [123.5, -33.9], [126, -32.3], [129, -31.6], [131.2, -31.5], [134.2, -32.7], [135.9, -34.8], [138.1, -33.5], [138.5, -35.5], [140.5, -38], [143.5, -38.8], [146.3, -39.1], [148.5, -37.8], [150, -37.5], [150.8, -34.5], [151.5, -33], [153.1, -30.5], [153.6, -28], [153, -25.5], [151.3, -23.8], [149.5, -22.3], [148.8, -20.4], [146.3, -18.9], [145.4, -15.5], [143.8, -14], [142.6, -10.7], [141.6, -12.7], [141.5, -15.5], [140.8, -17.5], [139.3, -17.4], [137.9, -16.3], [135.5, -14.8], [136.8, -12.2], [135.8, -12], [132.6, -11.5], [131, -12.2], [129.5, -14.8], [127.5, -14.1], [125.5, -14.5], [124, -16.3], [122.2, -17.8], [121.2, -19.5], [118.8, -20.3], [116.5, -20.7], [114.1, -21.8]],
  [[144.6, -40.7], [148.3, -40.9], [148, -43.2], [146.3, -43.6], [144.8, -42.2]],
  [[172.7, -34.4], [174.4, -35.5], [175.6, -37], [178.5, -37.7], [177.9, -39.2], [176.8, -39.5], [175.2, -41.6], [174.8, -41.2], [173.8, -39.2], [174.5, -38]],
  [[172.7, -40.5], [174.3, -41.3], [173.3, -43], [171.2, -44.5], [170.8, -45.9], [169, -46.6], [166.5, -46], [167.5, -44.5], [170.5, -43], [172, -41.5]],
  // Antarctica
  [[-180, -90], [-180, -78], [-160, -77.5], [-150, -76.5], [-140, -75], [-120, -73.5], [-100, -72.5], [-80, -73], [-75, -71], [-68, -67], [-63, -64.5], [-58, -63.3], [-60, -67], [-62, -70], [-60, -74], [-45, -78], [-30, -77], [-20, -73.5], [0, -70], [20, -70], [40, -69], [55, -66.5], [70, -68], [80, -67], [90, -66.5], [100, -66], [120, -66.5], [140, -66.5], [160, -70], [170, -72], [180, -78], [180, -90]],
];
// inland water cut out of the land
export const WATER = [
  [[27.5, 42.5], [28, 43.5], [28.6, 44.3], [29.6, 45.3], [30.8, 46.5], [31.8, 46.6], [33.5, 46], [33.6, 44.5], [35.5, 45.2], [37.5, 45.4], [38.5, 44.4], [40, 43.4], [41.7, 41.6], [39, 41], [37, 41.2], [35, 42], [33, 42], [31, 41.2], [29, 41.2], [28, 42]],
  [[47, 44.8], [46.8, 43], [47.7, 42.6], [49.1, 41.5], [49.6, 40.2], [49, 38.5], [49, 37.6], [50.5, 37], [53.8, 36.9], [53.9, 38.8], [52.8, 40], [53, 41.7], [52.6, 42.8], [51.2, 43.3], [51.3, 44.5], [53, 45.3], [52.8, 46.8], [51, 47], [49, 46.4]],
  [[-92, 46.7], [-89.5, 48], [-86, 48.8], [-84.6, 46.5], [-87.5, 46.4]],
  [[-88, 44.5], [-87.5, 42], [-86.5, 42], [-86.2, 44.5], [-85, 45.8], [-87, 45.9]],
  [[-84.7, 45.9], [-81.5, 45.9], [-80, 44.5], [-81.7, 43], [-82.4, 43.1], [-83.3, 44.3], [-84, 45.2]],
];
// population hotspots [lon, lat, weight, spread degrees] for placing users
const POP = [
  [116, 32, 1.0, 5], [115, 37, 0.7, 3.5], [113.5, 23, 0.5, 2.5], [105, 30, 0.4, 3], [121, 31, 0.4, 1.5],
  [82, 26, 1.0, 5], [78, 13, 0.6, 3.5], [73, 19.5, 0.4, 2.5], [90, 23.7, 0.5, 2], [72, 31, 0.4, 3.5],
  [137, 35.5, 0.45, 2.2], [127, 37, 0.3, 1.2], [110, -7, 0.5, 2.5], [121, 14, 0.25, 1.5], [106, 16, 0.25, 3.5], [100.5, 14, 0.2, 2.5],
  [8, 49, 0.8, 7], [-1.5, 52.5, 0.35, 2], [12, 43, 0.3, 2.5], [-4, 40, 0.25, 3], [20, 52, 0.2, 3], [37.6, 55.7, 0.25, 3],
  [32, 39, 0.25, 3.5], [51, 34, 0.25, 3.5], [31.2, 30, 0.35, 1.2], [6, 8, 0.45, 3.5], [39, 9, 0.25, 3], [36.8, -1, 0.25, 3], [28, -26, 0.2, 3], [20, -3, 0.12, 6],
  [-77, 39, 0.6, 4.5], [-87, 41.8, 0.3, 3.5], [-90, 33, 0.25, 5], [-119, 35, 0.4, 2.5], [-97, 31, 0.25, 3], [-81.5, 28, 0.2, 1.8], [-122, 47.5, 0.12, 1.5],
  [-99, 19.5, 0.4, 2.5], [-88, 14, 0.12, 2.5], [-45, -22.5, 0.6, 3.5], [-38, -8, 0.3, 2.5], [-58.5, -34.6, 0.25, 2], [-74, 5, 0.25, 2.5], [-77, -12, 0.15, 1.5],
  [-70.6, -33.4, 0.12, 1.5], [-67, 10, 0.12, 2], [151, -33.9, 0.12, 1.5], [145, -37.8, 0.1, 1.2], [46.7, 24.7, 0.12, 3], [60, 56, 0.1, 12], [-79.4, 43.7, 0.12, 1.5], [-73.6, 45.5, 0.08, 1.5],
];

function landMask(W = 720, H = 360) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const path = (poly) => { g.beginPath(); poly.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * W, y = (90 - la) / 180 * H; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  g.fillStyle = '#fff'; LAND.forEach((p) => { path(p); g.fill(); });
  g.fillStyle = '#000'; WATER.forEach((p) => { path(p); g.fill(); });
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
  return { m, W, H, at: (lo, la) => m[Math.min(H - 1, Math.max(0, Math.floor((90 - la) / 180 * H))) * W + ((Math.floor((lo + 180) / 360 * W) % W) + W) % W], canvas: c };
}

const v3 = (lo, la, r = 1) => {
  const p = THREE.MathUtils.degToRad(la), l = THREE.MathUtils.degToRad(lo);
  return new THREE.Vector3(r * Math.cos(p) * Math.sin(l), r * Math.sin(p), r * Math.cos(p) * Math.cos(l));
};

register('globe_users', (opts) => {
  const growFrom = opts.growFrom ?? 0.05, growTo = opts.growTo ?? 0.9, showArcs = opts.arcs ?? true, seed = opts.seed ?? 4;
  const R = rng(seed * 104729 + 17);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 200);
  const mask = landMask();
  const globe = new THREE.Group();
  scene.add(globe);
  const U = { uT: { value: 0 }, uK: { value: 0 }, uScale: { value: 1 }, uSun: { value: new THREE.Vector3(-0.55, 0.35, -0.75).normalize() } };

  // ---- planet body: near-black with a soft cold fresnel rim ----
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.995, 96, 64), new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWN = normalize(mat3(modelMatrix) * normal); vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * wp).xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){
        float f = 1.0 - max(dot(vN, vV), 0.0);
        float sun = max(dot(vWN, uSun), 0.0);
        vec3 col = vec3(0.003, 0.005, 0.008) + vec3(0.02, 0.05, 0.075) * pow(f, 4.0) + vec3(0.03, 0.06, 0.08) * pow(f, 3.0) * sun;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  globe.add(body);

  // ---- land dots on latitude rings ----
  {
    const P = [], A = [];
    const step = 1.15;
    for (let la = -84; la <= 84; la += step) {
      const n = Math.max(1, Math.round(360 * Math.cos(THREE.MathUtils.degToRad(la)) / step));
      for (let i = 0; i < n; i++) {
        const lo = -180 + (i + 0.5) * 360 / n;
        const land = mask.at(lo, la);
        if (!land) continue;
        const p = v3(lo, la, 1.0);
        P.push(p.x, p.y, p.z);
        A.push(0.75 + R() * 0.5);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(A, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform float uScale; uniform vec3 uSun; attribute float aB; varying vec3 vC;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(wp.xyz);
          vec4 mv = viewMatrix * wp;
          vec3 v = normalize(-mv.xyz);
          float facing = dot(normalize(mat3(viewMatrix) * n), v);
          float sun = max(dot(n, uSun), 0.0);
          gl_PointSize = clamp(0.0062 * uScale / -mv.z, 1.0, 7.0);
          float limb = smoothstep(0.0, 0.35, facing);
          vC = (vec3(0.13, 0.26, 0.31) + vec3(0.16, 0.26, 0.28) * sun) * aB * limb;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); float a = 1.0 - smoothstep(0.30, 0.5, r); if (a < 0.01) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    });
    const dots = new THREE.Points(g, mat);
    dots.renderOrder = 2;
    globe.add(dots);
  }

  // ---- user lights: weighted to the populated regions, each with its own switch-on time ----
  const users = [];
  {
    const wsum = POP.reduce((a, p) => a + p[2], 0);
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += R(); return (s - 2) / 0.577; };
    let guard = 0;
    while (users.length < 6500 && guard++ < 200000) {
      let lo, la;
      if (R() < 0.12) { lo = R() * 360 - 180; la = Math.asin(R() * 2 - 1) * 180 / Math.PI; if (Math.abs(la) > 62) continue; }
      else {
        let r = R() * wsum, h = POP[0];
        for (const p of POP) { r -= p[2]; if (r <= 0) { h = p; break; } }
        lo = h[0] + gauss() * h[3]; la = h[1] + gauss() * h[3] * 0.8;
      }
      if (!mask.at(lo, la)) continue;
      users.push([lo, la]);
    }
    const P = [], T = [], S = [];
    users.forEach(([lo, la], i) => {
      const p = v3(lo, la, 1.003);
      P.push(p.x, p.y, p.z);
      // accelerating adoption: few early adopters, then the rush
      T.push(Math.pow(R(), 0.6));
      S.push(R());
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aOn', new THREE.Float32BufferAttribute(T, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uGrow: { value: 0 }, uDurG: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform float uScale; uniform float uT; uniform float uGrow; uniform float uDurG; attribute float aOn; attribute float aS; varying vec3 vC;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(wp.xyz);
          vec4 mv = viewMatrix * wp;
          float facing = dot(normalize(mat3(viewMatrix) * n), normalize(-mv.xyz));
          float age = (uGrow - aOn) * uDurG;     // seconds since this user arrived
          float on = step(0.0, age);
          float flash = 1.0 + 3.0 * exp(-max(age, 0.0) * 3.0);
          float tw = 0.8 + 0.2 * sin(uT * (1.5 + aS * 3.0) + aS * 30.0);
          gl_PointSize = clamp(0.010 * uScale / -mv.z * (0.7 + 0.6 * aS) * (1.0 + 0.8 * exp(-max(age, 0.0) * 3.0)), 1.0, 14.0) * on;
          vec3 c = mix(vec3(1.0, 0.62, 0.24), vec3(1.0, 0.86, 0.62), step(0.8, aS));
          vC = c * (0.9 + 0.8 * aS) * flash * tw * on * smoothstep(0.0, 0.25, facing);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; float a = exp(-r * r * 5.0); if (a < 0.02) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    });
    var userMat = mat;
    const pts = new THREE.Points(g, mat);
    pts.renderOrder = 3;
    globe.add(pts);
  }

  // ---- the hub and the arcs streaming into it ----
  const HUB = [-80, 40];
  const hubN = v3(HUB[0], HUB[1], 1).normalize();
  const hubP = hubN.clone().multiplyScalar(1.006);
  const hubGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,240,215,1)'), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  hubGlow.position.copy(hubP); hubGlow.renderOrder = 6;
  globe.add(hubGlow);
  const hubHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(240,166,58,1)'), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
  hubHalo.position.copy(hubP); hubHalo.renderOrder = 6;
  globe.add(hubHalo);
  // sonar-like rings spreading over the surface from the hub
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const rm = new THREE.Mesh(new THREE.RingGeometry(0.965, 1.0, 96), new THREE.MeshBasicMaterial({ color: 0xf0b060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rm.position.copy(hubN.clone().multiplyScalar(1.004));
    rm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hubN);
    rm.renderOrder = 5;
    globe.add(rm); rings.push(rm);
  }

  const arcMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uGrow: userMat.uniforms.uGrow },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`attribute float aT; attribute vec3 aArc; varying float vT; varying vec3 vArc;
      void main(){ vT = aT; vArc = aArc; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uT; uniform float uGrow; varying float vT; varying vec3 vArc;
      void main(){
        // vArc.x = this arc's start (grow units), vArc.y = phase, vArc.z = 1 for arcs into the hub, 0 city-to-city
        float age = uGrow - vArc.x;
        if (age < 0.0) discard;
        float head = clamp(age * 3.0, 0.0, 1.0);      // the arc draws itself from the city toward its target
        if (vT > head) discard;
        float hub = vArc.z;
        float base = mix(0.035, 0.06, hub);
        float pulse = pow(fract(vT * 2.0 - uT * 0.45 + vArc.y), 12.0) * mix(0.5, 1.2, hub);
        float tip = exp(-pow((vT - head) / 0.03, 2.0)) * 2.0 * step(head, 0.999);
        vec3 c = mix(vec3(0.42, 0.76, 0.74), vec3(1.0, 0.75, 0.42), smoothstep(0.55, 1.0, vT) * hub);
        float fade = smoothstep(0.0, 0.06, vT) * (1.0 - mix(0.0, 0.75, hub) * smoothstep(0.82, 1.0, vT)) * mix(smoothstep(1.0, 0.9, vT), 1.0, hub);
        gl_FragColor = vec4(c * (base + pulse + tip) * fade, 1.0);
      }`,
  });
  if (showArcs) {
    const arcGeo = [];
    const mk = (A0, B0, start, kind) => {
      const ang = A0.angleTo(B0);
      const curve = [], N = 48, lift = 0.015 + ang * 0.12, s = Math.sin(ang);
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        // slerp on the unit sphere, lifted by a sine arch
        const p = A0.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(B0.clone().multiplyScalar(Math.sin(t * ang) / s));
        p.multiplyScalar(1.004 + lift * Math.sin(Math.PI * t));
        curve.push(p);
      }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve), N, kind ? 0.0026 : 0.0018, 4, false);
      const n = tg.attributes.position.count, aT = new Float32Array(n), aArc = new Float32Array(n * 3);
      const phase = R();
      for (let i = 0; i < n; i++) { aT[i] = Math.floor(i / 5) / N; aArc[i * 3] = start; aArc[i * 3 + 1] = phase; aArc[i * 3 + 2] = kind; }
      tg.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
      tg.setAttribute('aArc', new THREE.BufferAttribute(aArc, 3));
      arcGeo.push(tg);
    };
    for (let a = 0, guard = 0; a < 80 && guard < 5000; guard++) {
      const u = users[Math.floor(R() * users.length)];
      const A0 = v3(u[0], u[1], 1.0), ang = A0.angleTo(hubN);
      if (ang < 0.15 || ang > 2.0) continue;
      mk(A0, hubN, 0.02 + Math.pow(R(), 0.8) * 0.85, 1); a++;
    }
    for (let a = 0, guard = 0; a < 40 && guard < 5000; guard++) {
      const u = users[Math.floor(R() * users.length)], w = users[Math.floor(R() * users.length)];
      const A0 = v3(u[0], u[1], 1.0), B0 = v3(w[0], w[1], 1.0), ang = A0.angleTo(B0);
      if (ang < 0.25 || ang > 1.2) continue;
      mk(A0, B0, 0.1 + R() * 0.8, 0); a++;
    }
    // merge into one geometry (one draw call)
    let total = 0, totalIdx = 0;
    arcGeo.forEach((g) => { total += g.attributes.position.count; totalIdx += g.index.count; });
    const pos = new Float32Array(total * 3), aT = new Float32Array(total), aArc = new Float32Array(total * 3), idx = new Uint32Array(totalIdx);
    let o = 0, oi = 0;
    arcGeo.forEach((g) => {
      pos.set(g.attributes.position.array, o * 3); aT.set(g.attributes.aT.array, o); aArc.set(g.attributes.aArc.array, o * 3);
      const gi = g.index.array; for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + o;
      o += g.attributes.position.count; oi += gi.length;
    });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    mg.setAttribute('aArc', new THREE.BufferAttribute(aArc, 3));
    mg.setIndex(new THREE.BufferAttribute(idx, 1));
    const arcs = new THREE.Mesh(mg, arcMat);
    arcs.renderOrder = 4;
    arcs.frustumCulled = false;
    globe.add(arcs);
  }

  // ---- atmosphere: a back-face shell shaded by how close each view ray passes to the planet ----
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.32, 96, 64), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uSun; varying vec3 vW;
      void main(){
        vec3 D = normalize(vW - cameraPosition);
        float t = -dot(cameraPosition, D);
        vec3 Pc = cameraPosition + D * t;           // closest point of the ray to the planet centre
        float b = length(Pc);
        if (b < 0.999) discard;
        float h = b - 1.0;
        float g = exp(-h / 0.02) * 0.6 + exp(-h / 0.06) * 0.25;
        float sun = pow(max(dot(normalize(Pc), uSun) * 0.5 + 0.5, 0.0), 1.5);
        vec3 c = mix(vec3(0.22, 0.40, 0.62), vec3(0.50, 0.85, 0.86), sun);
        gl_FragColor = vec4(c * g * (0.25 + 0.95 * sun), 1.0);
      }`,
  }));
  atm.renderOrder = 1;
  scene.add(atm);
  // the same scattering seen just inside the limb
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1.0015, 96, 64), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWN = normalize(wp.xyz); vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * wp).xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){
        float f = 1.0 - max(dot(vN, vV), 0.0);
        float sun = pow(max(dot(vWN, uSun) * 0.5 + 0.5, 0.0), 1.5);
        vec3 c = mix(vec3(0.22, 0.40, 0.62), vec3(0.50, 0.85, 0.86), sun);
        gl_FragColor = vec4(c * pow(f, 5.0) * (0.12 + 0.6 * sun), 1.0);
      }`,
  }));
  inner.renderOrder = 1;
  scene.add(inner);

  // ---- stars ----
  {
    const P = [], C = [];
    for (let i = 0; i < 1800; i++) {
      const u = R() * 2 - 1, t = R() * Math.PI * 2, r = 60 + R() * 20;
      P.push(r * Math.sqrt(1 - u * u) * Math.cos(t), r * u, r * Math.sqrt(1 - u * u) * Math.sin(t));
      const b = Math.pow(R(), 6) * 2.5 + 0.08; C.push(b * 0.85, b * 0.9, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    st.renderOrder = 0;
    scene.add(st);
  }

  return {
    scene, camera,
    bloom: { strength: 0.7, radius: 0.45, threshold: 0.45 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      U.uT.value = lt; U.uK.value = k;
      userMat.uniforms.uGrow.value = clamp((k - growFrom) / Math.max(0.01, growTo - growFrom), -1, 1.5);
      userMat.uniforms.uDurG.value = c.dur * (growTo - growFrom);
      const m = ease.inOut(k);
      // slow orbit (the globe turns under a drifting camera) and push
      globe.rotation.y = THREE.MathUtils.degToRad(lerp(40, 58, m));
      const dist = lerp(5.4, 4.25, m);
      const el = lerp(0.42, 0.30, m);
      const az = lerp(-0.10, 0.08, m);
      camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
      camera.lookAt(0, lerp(0.12, 0.05, m), 0);
      camera.rotateZ(lerp(0.03, -0.01, m));
      U.uScale.value = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const pulse = 1 + 0.08 * Math.sin(lt * 2.4);
      const hubOn = clamp((userMat.uniforms.uGrow.value + 0.05) * 4);
      hubGlow.scale.setScalar(0.075 * pulse * (0.4 + 0.6 * hubOn));
      hubHalo.scale.setScalar(0.32 * pulse * (0.3 + 0.7 * hubOn));
      hubHalo.material.opacity = 0.35 * hubOn;
      rings.forEach((rm, i) => {
        const ph = ((lt / 1.6 + i / 3) % 1 + 1) % 1;
        rm.scale.setScalar(0.02 + 0.26 * ease.out(ph));
        rm.material.opacity = 0.32 * (1 - ph) * (1 - ph) * hubOn;
      });
    },
  };
});
