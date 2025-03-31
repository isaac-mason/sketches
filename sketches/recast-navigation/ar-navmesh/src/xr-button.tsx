import { Container, Text } from "@react-three/uikit";
import { useXRSessionModeSupported, useXRStore } from "@react-three/xr";

export function EnterXRButton() {
  const store = useXRStore();

  const vr = useXRSessionModeSupported("immersive-vr");
  const ar = useXRSessionModeSupported("immersive-ar");

  return (
    <Container
      onClick={() => (ar ? store.enterAR() : vr ? store.enterVR() : undefined)}
      backgroundColor={"#f0f0f0"}
      borderRadius={2}
      borderColor={"black"}
      borderWidth={1}
      padding={10}
    >
      <Text>{ar ? "Enter AR" : vr ? "Enter VR" : "No Support"}</Text>
    </Container>
  );
}