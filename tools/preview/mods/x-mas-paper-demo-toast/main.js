// The notification mod of the preview picture: it draws nothing and closes at once, so a Herdr
// notification naming a real session cannot reach the picture. Preview only, never installed.
import { View, div } from "gpui-kit";
import { closeOverlay, props } from "herdr";

export default class DemoToast extends View {
  init() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  render() {
    return div();
  }
}
