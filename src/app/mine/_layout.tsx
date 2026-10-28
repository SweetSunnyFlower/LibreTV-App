import { Stack } from 'expo-router';

export default function MyStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="favorites" />
      <Stack.Screen name="search-history" />
      <Stack.Screen name="watch-history" />
      <Stack.Screen name="downloads" />
    </Stack>
  );
}
