import 'package:flutter/material.dart';
import 'widgets/home_page.dart';

void main() {
  runApp(const AnimatedDrawingsApp());
}

class AnimatedDrawingsApp extends StatelessWidget {
  const AnimatedDrawingsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AnimatedDrawings Flutter Web',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        colorScheme: const ColorScheme.dark(
          primary: Colors.blueAccent,
          secondary: Colors.tealAccent,
        ),
      ),
      home: const HomePage(),
    );
  }
}
