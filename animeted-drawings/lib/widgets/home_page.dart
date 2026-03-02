import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/character_data.dart';
import '../models/bvh_parser.dart';
import 'animated_character.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  CharacterData? _characterData;
  bool _isLoading = true;
  bool _isPlaying = true;
  double _speed = 1.0;
  bool _debugSkeleton = false;
  String _errorMessage = '';

  static const String _characterAsset =
      'assets/characters/irasutoya_girl';

  static const List<String> _motions = [
    'wave_hello',
    'zombie',
  ];
  String _currentMotion = 'wave_hello';

  @override
  void initState() {
    super.initState();
    _loadCharacter();
  }

  Future<void> _loadCharacter() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final data = await CharacterData.load(
        characterAsset: _characterAsset,
        motionAsset: 'assets/motions/$_currentMotion.bvh',
      );
      setState(() {
        _characterData = data;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _switchMotion(String motionName) async {
    if (motionName == _currentMotion) return;

    setState(() => _currentMotion = motionName);

    try {
      final bvhStr = await rootBundle.loadString(
        'assets/motions/$motionName.bvh',
      );
      final bvhData = BvhParser.parse(bvhStr);
      setState(() {
        _characterData = _characterData?.copyWithMotion(bvhData, motionName);
      });
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF16213E),
        title: const Text(
          'AnimatedDrawings - Flutter Web',
          style: TextStyle(color: Colors.white),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _debugSkeleton ? Icons.visibility_off : Icons.visibility,
              color: Colors.white70,
            ),
            tooltip: 'Toggle skeleton debug',
            onPressed: () => setState(() => _debugSkeleton = !_debugSkeleton),
          ),
        ],
      ),
      body: Column(
        children: [
          // Character display area
          Expanded(
            child: _buildCharacterView(),
          ),
          // Controls panel
          _buildControls(),
        ],
      ),
    );
  }

  Widget _buildCharacterView() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 16),
            Text(
              'Loading character...',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        ),
      );
    }

    if (_errorMessage.isNotEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
            const SizedBox(height: 16),
            Text(
              'Error: $_errorMessage',
              style: const TextStyle(color: Colors.redAccent),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadCharacter,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_characterData == null) {
      return const Center(
        child: Text('No character loaded', style: TextStyle(color: Colors.white70)),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: AspectRatio(
          aspectRatio: _characterData!.skeleton.imageWidth /
              _characterData!.skeleton.imageHeight.toDouble(),
          child: AnimatedCharacter(
            key: ValueKey(_currentMotion),
            characterData: _characterData!,
            isPlaying: _isPlaying,
            speed: _speed,
            debugSkeleton: _debugSkeleton,
          ),
        ),
      ),
    );
  }

  Widget _buildControls() {
    return Container(
      color: const Color(0xFF16213E),
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Motion selector
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'Motion: ',
                style: TextStyle(color: Colors.white70),
              ),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: _currentMotion,
                dropdownColor: const Color(0xFF1A1A2E),
                style: const TextStyle(color: Colors.white),
                items: _motions.map((name) {
                  return DropdownMenuItem(
                    value: name,
                    child: Text(
                      name.replaceAll('_', ' '),
                      style: const TextStyle(color: Colors.white),
                    ),
                  );
                }).toList(),
                onChanged: (value) {
                  if (value != null) _switchMotion(value);
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Play/Pause + Speed
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                icon: Icon(
                  _isPlaying ? Icons.pause : Icons.play_arrow,
                  color: Colors.white,
                  size: 32,
                ),
                onPressed: () => setState(() => _isPlaying = !_isPlaying),
              ),
              const SizedBox(width: 16),
              const Text(
                'Speed:',
                style: TextStyle(color: Colors.white70),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 200,
                child: Slider(
                  value: _speed,
                  min: 0.25,
                  max: 3.0,
                  divisions: 11,
                  label: '${_speed.toStringAsFixed(2)}x',
                  activeColor: Colors.blueAccent,
                  onChanged: (val) => setState(() => _speed = val),
                ),
              ),
              Text(
                '${_speed.toStringAsFixed(2)}x',
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
