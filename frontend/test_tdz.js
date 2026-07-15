const { useEffect } = require('react');
// Mocking react
function Component() {
  const onKey = () => {
    console.log(playAllFreshRef.current);
  };
  
  const playAllFreshRef = { current: "HELLO" };
  
  onKey();
}
Component();
