import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'skeleton.dart';
import 'bvh_parser.dart';

class CharacterData {
  final Skeleton skeleton;
  final ui.Image texture;
  final BvhData bvhData;
  final String motionName;

  CharacterData({
    required this.skeleton,
    required this.texture,
    required this.bvhData,
    required this.motionName,
  });

  static Future<CharacterData> load({
    required String characterAsset,
    required String motionAsset,
  }) async {
    // Load config.json
    final configStr = await rootBundle.loadString(
      '$characterAsset/config.json',
    );
    final configJson = jsonDecode(configStr) as Map<String, dynamic>;
    final skeleton = Skeleton.fromJson(configJson);

    // Load texture
    final textureBytes = await rootBundle.load('$characterAsset/texture.png');
    final codec = await ui.instantiateImageCodec(
      textureBytes.buffer.asUint8List(),
    );
    final frame = await codec.getNextFrame();
    final texture = frame.image;

    // Load BVH
    final bvhStr = await rootBundle.loadString(motionAsset);
    final bvhData = BvhParser.parse(bvhStr);

    final motionName = motionAsset.split('/').last.replaceAll('.bvh', '');

    return CharacterData(
      skeleton: skeleton,
      texture: texture,
      bvhData: bvhData,
      motionName: motionName,
    );
  }

  CharacterData copyWithMotion(BvhData newBvh, String newMotionName) {
    return CharacterData(
      skeleton: skeleton,
      texture: texture,
      bvhData: newBvh,
      motionName: newMotionName,
    );
  }
}
