import lf from "@/src/live-folder";

export default defineBackground({
  type: "module",
  main() {
    (async () => {
      await lf.init();
    })();
  },
});
