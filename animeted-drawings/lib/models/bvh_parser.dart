import 'dart:math' as math;
import 'package:vector_math/vector_math_64.dart';

class BvhJoint {
  final String name;
  final Vector3 offset;
  final List<String> channels;
  final List<BvhJoint> children;
  BvhJoint? parent;

  BvhJoint({
    required this.name,
    required this.offset,
    required this.channels,
    required this.children,
    this.parent,
  });
}

class BvhData {
  final List<BvhJoint> joints; // flat list in order
  final BvhJoint root;
  final int frameCount;
  final double frameTime;
  final List<List<double>> frames; // frames[frameIndex][channelIndex]

  const BvhData({
    required this.joints,
    required this.root,
    required this.frameCount,
    required this.frameTime,
    required this.frames,
  });

  /// Returns the per-joint world-space positions for a given frame.
  Map<String, Vector3> getJointPositions(int frameIndex) {
    if (frames.isEmpty) return {};
    final frameData = frames[frameIndex % frames.length];
    final positions = <String, Vector3>{};
    int channelOffset = 0;

    void traverse(BvhJoint joint, Matrix4 parentTransform) {
      final localTransform = Matrix4.identity();

      // Apply offset
      localTransform.translateByVector3(joint.offset);

      // Apply channels from frame data
      double tx = 0, ty = 0, tz = 0;
      double rx = 0, ry = 0, rz = 0;

      for (final channel in joint.channels) {
        if (channelOffset < frameData.length) {
          final val = frameData[channelOffset++];
          switch (channel) {
            case 'Xposition':
              tx = val;
            case 'Yposition':
              ty = val;
            case 'Zposition':
              tz = val;
            case 'Xrotation':
              rx = val;
            case 'Yrotation':
              ry = val;
            case 'Zrotation':
              rz = val;
          }
        }
      }

      if (tx != 0 || ty != 0 || tz != 0) {
        localTransform.translateByVector3(Vector3(tx, ty, tz));
      }

      // Apply rotations (ZXY order as common in BVH)
      if (rz != 0) localTransform.rotateZ(rz * math.pi / 180.0);
      if (rx != 0) localTransform.rotateX(rx * math.pi / 180.0);
      if (ry != 0) localTransform.rotateY(ry * math.pi / 180.0);

      final worldTransform = parentTransform * localTransform;
      final worldPos = worldTransform.getTranslation();
      positions[joint.name] = worldPos;

      for (final child in joint.children) {
        traverse(child, worldTransform);
      }
    }

    traverse(root, Matrix4.identity());
    return positions;
  }

  /// Returns the per-joint local rotation matrices for a given frame.
  Map<String, Matrix4> getJointRotations(int frameIndex) {
    if (frames.isEmpty) return {};
    final frameData = frames[frameIndex % frames.length];
    final rotations = <String, Matrix4>{};
    int channelOffset = 0;

    void traverse(BvhJoint joint) {
      double rx = 0, ry = 0, rz = 0;

      for (final channel in joint.channels) {
        if (channelOffset < frameData.length) {
          final val = frameData[channelOffset++];
          switch (channel) {
            case 'Xrotation':
              rx = val;
            case 'Yrotation':
              ry = val;
            case 'Zrotation':
              rz = val;
            case 'Xposition':
            case 'Yposition':
            case 'Zposition':
              break;
          }
        }
      }

      final rot = Matrix4.identity();
      if (rz != 0) rot.rotateZ(rz * math.pi / 180.0);
      if (rx != 0) rot.rotateX(rx * math.pi / 180.0);
      if (ry != 0) rot.rotateY(ry * math.pi / 180.0);
      rotations[joint.name] = rot;

      for (final child in joint.children) {
        traverse(child);
      }
    }

    traverse(root);
    return rotations;
  }
}

class BvhParser {
  static BvhData parse(String content) {
    final lines = content
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    int i = 0;
    final allJoints = <BvhJoint>[];

    BvhJoint parseJoint(String name, {BvhJoint? parent}) {
      // Expect '{'
      i++;
      final offset = _parseOffset(lines[i++]);
      final channels = _parseChannels(lines[i++]);
      final joint = BvhJoint(
        name: name,
        offset: offset,
        channels: channels,
        children: [],
        parent: parent,
      );
      allJoints.add(joint);

      while (i < lines.length) {
        final line = lines[i];
        if (line.startsWith('JOINT ')) {
          final childName = line.substring(6).trim();
          i++;
          joint.children.add(parseJoint(childName, parent: joint));
        } else if (line.startsWith('End Site')) {
          i++; // {
          i++; // OFFSET
          i++; // }
          break;
        } else if (line == '}') {
          i++;
          break;
        } else {
          i++;
        }
      }

      return joint;
    }

    // Find ROOT
    while (i < lines.length && !lines[i].startsWith('ROOT ')) {
      i++;
    }
    final rootName = lines[i].substring(5).trim();
    i++;
    final root = parseJoint(rootName);

    // Find MOTION section
    while (i < lines.length && lines[i] != 'MOTION') {
      i++;
    }
    i++; // skip MOTION

    final frameCount = int.parse(lines[i++].split(':').last.trim());
    final frameTime = double.parse(lines[i++].split(':').last.trim());

    final frames = <List<double>>[];
    while (i < lines.length) {
      final parts = lines[i++].split(RegExp(r'\s+'));
      if (parts.isNotEmpty && parts.first.isNotEmpty) {
        final values = parts
            .where((p) => p.isNotEmpty)
            .map((p) => double.tryParse(p) ?? 0.0)
            .toList();
        if (values.isNotEmpty) {
          frames.add(values);
        }
      }
    }

    return BvhData(
      joints: allJoints,
      root: root,
      frameCount: frameCount,
      frameTime: frameTime,
      frames: frames,
    );
  }

  static Vector3 _parseOffset(String line) {
    final parts = line.trim().split(RegExp(r'\s+'));
    // parts[0] == 'OFFSET'
    return Vector3(
      double.tryParse(parts[1]) ?? 0.0,
      double.tryParse(parts[2]) ?? 0.0,
      double.tryParse(parts[3]) ?? 0.0,
    );
  }

  static List<String> _parseChannels(String line) {
    final parts = line.trim().split(RegExp(r'\s+'));
    // parts[0] == 'CHANNELS', parts[1] == count, rest == channel names
    final count = int.tryParse(parts[1]) ?? 0;
    return parts.sublist(2, 2 + count);
  }
}
